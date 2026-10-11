/**
 * Vercel injects `BLOB_READ_WRITE_TOKEN` for a connected Blob store. Local
 * development must provide it explicitly. OIDC is also supported by the Blob
 * SDK when a store id is configured.
 */
export function isBlobStorageConfigured() {
  return Boolean(
    process.env.BLOB_READ_WRITE_TOKEN ||
      (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID),
  );
}

export const blobStorageConfigurationMessage =
  "Recording uploads are not configured. Add BLOB_READ_WRITE_TOKEN to this environment and restart the app.";
