-- A supplier who is not GST-registered issues a bill of supply, not a tax
-- invoice. Until now every document was labelled a tax invoice regardless,
-- and 18% GST was charged to Indian buyers whether or not there was any
-- authority to collect it — which section 32 of the CGST Act makes an offence.
--
-- Stored per row rather than read from configuration at render time: the day
-- registration comes through, config flips, and documents already issued and
-- filed must keep saying what they said.
ALTER TABLE "Invoice"
  ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'TAX_INVOICE';

-- Existing rows carry tax, so they were issued by a registered supplier and
-- the default is right for them.
