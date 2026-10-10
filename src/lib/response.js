/** Consistent API envelope for web + future mobile clients */
export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

export function fail(res, error, status = 400) {
  const message = typeof error === "string" ? error : error?.message || "Request failed";
  const code = error?.code || undefined;
  return res.status(status).json({ success: false, error: { message, code } });
}
