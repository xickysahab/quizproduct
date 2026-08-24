-- Where the buyer is, stated rather than inferred.
--
-- GST was computed from `stateCode` alone, treating null as "outside India,
-- zero-rated". But null was also the state of every workspace that had simply
-- never filled the form in — which was all of them, since no UI existed. Every
-- Indian sale was therefore invoiced at 0% GST while the 18% was still owed to
-- the government.
--
-- Defaulting to 'IN' makes the safe case the default: a workspace with no
-- state code on file is now blocked at checkout until it supplies one, rather
-- than quietly billed as an export.
ALTER TABLE "Organization"
  ADD COLUMN "billingCountry" TEXT NOT NULL DEFAULT 'IN';
