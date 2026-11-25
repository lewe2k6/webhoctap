import { AwsClient } from "npm:aws4fetch@1.0.20";
import { RequestError, withOwner } from "../_shared/owner.ts";

const linkLifetime = 30 * 60;

Deno.serve(withOwner(async (client, { documentId }) => {
  if (typeof documentId !== "string" || !/^[0-9a-f]{64}$/.test(documentId)) {
    throw new RequestError(400, "invalid_document", "Mã tài liệu không hợp lệ.");
  }

  const { data: objectKey, error } = await client.rpc("study_document_key", {
    p_document_id: documentId,
  });
  if (error) throw error;
  if (typeof objectKey !== "string" || !objectKey) {
    throw new RequestError(404, "pdf_unavailable", "Tài liệu này hiện chỉ có liên kết TMU.");
  }

  const accountId = Deno.env.get("R2_ACCOUNT_ID");
  const bucket = Deno.env.get("R2_BUCKET");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID");
  const secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) ||
    !bucket || !/^[a-z0-9-]{3,63}$/.test(bucket) || !accessKeyId || !secretAccessKey) {
    throw new RequestError(503, "storage_unconfigured", "Kho PDF chưa được thiết lập.");
  }

  const path = objectKey.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${path}`);
  url.searchParams.set("X-Amz-Expires", String(linkLifetime));
  const signer = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  const signed = await signer.sign(url, { method: "GET", aws: { signQuery: true } });

  return { url: signed.url, expiresAt: new Date(Date.now() + linkLifetime * 1000).toISOString() };
}));
