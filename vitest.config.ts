import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // See `src/test/server-only-mock.ts`'s header comment.
      "server-only": path.resolve(__dirname, "./src/test/server-only-mock.ts"),
      // See `src/test/next-intl-mock.ts`'s header comment: resolves
      // useTranslations/getTranslations from the real en.json instead of
      // requiring every test to wrap its tree in NextIntlClientProvider.
      "next-intl/server": path.resolve(__dirname, "./src/test/next-intl-server-mock.ts"),
      "next-intl": path.resolve(__dirname, "./src/test/next-intl-mock.ts"),
    },
  },
});
