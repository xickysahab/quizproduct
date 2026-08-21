import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { currentPeriod, limitsFor, PlanName } from '../utils/plans';
import { slog } from '../utils/slog';

export const getMyOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true, role: true },
    });

    if (!user?.organizationId) {
      res.status(404).json({ message: 'No organization is attached to this account.' });
      return;
    }

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
    });
    if (!org) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    const period = currentPeriod();
    const meter = await prisma.usageMeter.findUnique({
      where: { organizationId_period: { organizationId: org.id, period } },
    });
    const limits = limitsFor(org.plan as PlanName);

    res.json({
      organization: org,
      usage: {
        period,
        eventsCreated: meter?.eventsCreated ?? 0,
        participantsJoined: meter?.participantsJoined ?? 0,
        limits,
      },
    });
  } catch (error) {
    slog('error', 'org.get_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateMyOrganization = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { organizationId: true, role: true },
    });

    if (!user?.organizationId || (user.role !== 'TENANT' && user.role !== 'SUPERADMIN')) {
      res.status(403).json({ message: 'Only a tenant admin can update organization branding.' });
      return;
    }

    const org = await prisma.organization.findUnique({ where: { id: user.organizationId } });
    if (!org) {
      res.status(404).json({ message: 'Organization not found.' });
      return;
    }

    const limits = limitsFor(org.plan as PlanName);
    const { name, logoUrl, primaryColor } = req.body || {};
    const data: { name?: string; logoUrl?: string | null; primaryColor?: string | null } = {};

    if (typeof name === 'string' && name.trim()) data.name = name.trim();

    if (logoUrl !== undefined || primaryColor !== undefined) {
      if (!limits.branding) {
        res.status(402).json({ message: 'Custom branding is available on Pro and Enterprise plans.' });
        return;
      }
      if (logoUrl !== undefined) data.logoUrl = typeof logoUrl === 'string' && logoUrl.trim() ? logoUrl.trim() : null;
      if (primaryColor !== undefined) {
        data.primaryColor =
          typeof primaryColor === 'string' && /^#?[0-9a-fA-F]{3,8}$/.test(primaryColor)
            ? primaryColor.startsWith('#')
              ? primaryColor
              : `#${primaryColor}`
            : null;
      }
    }

    const updated = await prisma.organization.update({
      where: { id: org.id },
      data,
    });

    res.json({ message: 'Organization updated.', organization: updated });
  } catch (error) {
    slog('error', 'org.update_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const setOrganizationPlan = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = req.params.id as string;
    const plan = req.body?.plan as PlanName;
    if (!['FREE', 'PRO', 'ENTERPRISE'].includes(plan)) {
      res.status(400).json({ message: 'Plan must be FREE, PRO or ENTERPRISE.' });
      return;
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: { plan },
    });

    res.json({ message: 'Plan updated.', organization: updated });
  } catch (error) {
    slog('error', 'org.plan_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const listOrganizations = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true, events: true } } },
    });
    res.json({ organizations: orgs });
  } catch (error) {
    slog('error', 'org.list_failed', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ message: 'Internal server error' });
  }
};
