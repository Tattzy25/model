export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "POST only" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const contentType = request.headers.get("Content-Type") || "";

    // ── Multipart upload (ZIP folder or image from form) ──
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!file) {
        return new Response(
          JSON.stringify({ error: "No file field in form data" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" },
          },
        );
      }

      return await handleFile(file, env);
    }

    // ── Binary upload (raw body with type header) ──
    const fileType = request.headers.get("X-File-Type") || "";
    const fileName =
      request.headers.get("X-File-Name") || `upload-${Date.now()}`;

    if (!fileType) {
      return new Response(
        JSON.stringify({
          error: 'Provide X-File-Type header: "zip" or "image"',
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const body = await request.arrayBuffer();
    const file = new File([body], fileName, {
      type: fileType === "zip" ? "application/zip" : "image/*",
    });

    return await handleFile(file, env);
  },
};

async function handleFile(file, env) {
  const isZip =
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    file.name.toLowerCase().endsWith(".zip");

  const isImage = file.type.startsWith("image/");

  if (!isZip && !isImage) {
    return new Response(
      JSON.stringify({ error: "Only ZIP folders or images allowed" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // 100MB hard limit
  const MAX_SIZE = 100 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return new Response(JSON.stringify({ error: "Max file size is 100MB" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }

  const ext = isZip ? "zip" : file.name.split(".").pop().toLowerCase();
  const key = isZip
    ? `zips/${crypto.randomUUID()}.${ext}`
    : `images/${crypto.randomUUID()}.${ext}`;

  await env.MODEL_BUCKET.put(key, file.stream(), {
    httpMetadata: {
      contentType: isZip ? "application/zip" : file.type,
    },
    customMetadata: {
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    },
  });

  // ── Build public URL using your custom domain ──
  // Replace with your actual R2 custom domain
  const PUBLIC_DOMAIN = "model.digitalhustlelab.com";
  const url = `https://${PUBLIC_DOMAIN}/${key}`;

  return new Response(
    JSON.stringify({
      url,
      key,
      type: isZip ? "zip" : "image",
      size: file.size,
      originalName: file.name,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
