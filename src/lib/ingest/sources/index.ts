import type { Source } from "@/lib/ingest/types";
import { vanshb03Source } from "@/lib/ingest/sources/vanshb03";

// The single place to add/remove data sources. Phase 2 adds more adapters here.
export const sources: Source[] = [vanshb03Source];
