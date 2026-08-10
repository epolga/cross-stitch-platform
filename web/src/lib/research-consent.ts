// Master kill switch for the opt-in "save my photo for research" feature
// (Olga's ask, 2026-08-10) — off until she confirms the consent flow is
// GDPR-compliant (the site's legal address is in Czech Republic). Server-
// only env var, not NEXT_PUBLIC_, so flipping it needs an EB env var change
// + restart, not a rebuild — checked independently in both the config route
// the client reads to decide whether to show the checkbox, and again in
// /api/convert before any upload, so a stale/forged client request can't
// collect anything while this is off.
export function isResearchImageCollectionEnabled(): boolean {
  return process.env.RESEARCH_IMAGE_COLLECTION_ENABLED === 'true';
}
