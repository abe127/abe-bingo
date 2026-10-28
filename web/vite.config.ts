import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // ../shared のゲームロジックを読み込むため、1つ上の階層も配信対象にする
  server: { fs: { allow: [".."] } },
});
