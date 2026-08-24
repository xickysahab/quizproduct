import {
  LayoutDashboard,
  Users,
  Building2,
  Activity,
  Settings,
  ListPlus,
  Presentation,
  Tag,
} from 'lucide-react';
import type { Role } from '../context/AuthContext';

export interface SidebarItem {
  name: string;
  href: string;
  icon: React.ElementType;
}

export const dashboardTitleForRole = (role?: Role): string => {
  switch (role) {
    case 'SUPERADMIN':
      return 'SuperAdmin Panel';
    case 'SUBADMIN':
      return 'SubAdmin Panel';
    case 'TENANT':
      return 'Tenant Organization';
    default:
      return 'Staff Portal';
  }
};

export const sidebarForRole = (role?: Role): SidebarItem[] => {
  switch (role) {
    case 'SUPERADMIN':
      return [
        { name: 'Overview', href: '/superadmin', icon: LayoutDashboard },
        { name: 'SubAdmins', href: '/superadmin/subadmins', icon: Users },
        { name: 'All Tenants', href: '/superadmin/tenants', icon: Building2 },
        { name: 'All Quizzes', href: '/superadmin/quizzes', icon: ListPlus },
        { name: 'Pricing', href: '/superadmin/pricing', icon: Tag },
        { name: 'Organizations', href: '/superadmin/organizations', icon: Building2 },
        { name: 'Activity Logs', href: '/superadmin/logs', icon: Activity },
        { name: 'Settings', href: '/superadmin/settings', icon: Settings },
      ];
    case 'SUBADMIN':
      return [
        { name: 'Overview', href: '/subadmin', icon: LayoutDashboard },
        { name: 'Tenants', href: '/subadmin/tenants', icon: Building2 },
        { name: 'Quizzes', href: '/subadmin/quizzes', icon: ListPlus },
        { name: 'Activity Logs', href: '/subadmin/logs', icon: Activity },
        { name: 'Settings', href: '/subadmin/settings', icon: Settings },
      ];
    case 'TENANT':
      return [
        { name: 'Overview', href: '/tenant', icon: LayoutDashboard },
        { name: 'Staff', href: '/tenant/staff', icon: Users },
        { name: 'Quizzes', href: '/tenant/quizzes', icon: ListPlus },
        { name: 'Settings', href: '/tenant/settings', icon: Settings },
      ];
    default:
      return [
        { name: 'My Dashboard', href: '/staff', icon: LayoutDashboard },
        { name: 'My Quizzes', href: '/staff/quizzes', icon: Presentation },
        { name: 'Settings', href: '/staff/settings', icon: Settings },
      ];
  }
};
