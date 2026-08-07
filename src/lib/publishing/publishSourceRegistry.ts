import registryJson from "./publishSourceRegistry.json";

export type PublishSourceType = "content" | "asset" | "asset-tree" | "external" | "destination";

export type PublishSourceAdapter = {
  id: string;
  sourceType: PublishSourceType;
  sourceOfTruth: string;
  discovery: string;
  assetCollection: string;
  missingAssetsAllowed: boolean;
  outputPath: string;
  rewrite: string;
  verification: string;
  storage?: { database: string; store: string };
};

export type PublishSourceRegistry = { version: number; sources: PublishSourceAdapter[] };

export const publishSourceRegistry = registryJson as PublishSourceRegistry;

export function getPublishSourceAdapter(id: string): PublishSourceAdapter {
  const adapter = publishSourceRegistry.sources.find((candidate) => candidate.id === id);
  if (!adapter) throw new Error(`Unregistered publishing source adapter: ${id}`);
  return adapter;
}

export function getPublishSourceAdapterForStorage(database: string, store: string): PublishSourceAdapter | undefined {
  return publishSourceRegistry.sources.find((adapter) => adapter.storage?.database === database && adapter.storage.store === store);
}
