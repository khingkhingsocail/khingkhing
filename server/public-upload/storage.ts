import { publicMediaChunks } from "../../drizzle/schema";
import { PUBLIC_UPLOAD_CHUNK_BYTES } from "../../shared/publicUpload";
export function expectedChunkSize(size: number, index: number): number {
  if (
    !Number.isSafeInteger(size) ||
    size <= 0 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= Math.ceil(size / PUBLIC_UPLOAD_CHUNK_BYTES)
  )
    return 0;
  return Math.min(
    PUBLIC_UPLOAD_CHUNK_BYTES,
    size - index * PUBLIC_UPLOAD_CHUNK_BYTES
  );
}
export async function storeMediaChunks(
  tx: { insert: Function },
  mediaId: string,
  data: Buffer
) {
  // One query per chunk keeps each MySQL packet well below the managed 64 MiB cap.
  for (
    let offset = 0, sequence = 0;
    offset < data.length;
    offset += PUBLIC_UPLOAD_CHUNK_BYTES, sequence++
  ) {
    await tx
      .insert(publicMediaChunks)
      .values({
        mediaId,
        sequence,
        data: data.subarray(offset, offset + PUBLIC_UPLOAD_CHUNK_BYTES),
      });
  }
}
export class PublicUploadError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
