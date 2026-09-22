export const CLIENT = {
  pollMs: 3000,
  // H6: after 3 consecutive polling failures, slow down instead of hammering a
  // server that's already having trouble.
  reconnectPollMs: 10_000,
  reconnectAfterErrors: 3,
  // H5: the dropzone and the server-side upload check both read this, so the
  // client-side error message and the server's actual enforcement never drift.
  allowedImageTypes: ["image/jpeg", "image/png", "image/webp"],
};
