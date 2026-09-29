import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { checkConnections } from "./check-connections.mjs";
const mode = process.argv[2] === "production" ? "production" : "development";
process.env.NODE_ENV = mode;
try {
  if (!(await checkConnections(mode))) {
    console.error("لم يبدأ التطبيق. صحّح الإعدادات ثم أعد المحاولة.");
    process.exitCode = 1;
  } else {
    const require = createRequire(import.meta.url);
    const child = spawn(
      process.execPath,
      [
        require.resolve("next/dist/bin/next"),
        mode === "production" ? "start" : "dev",
        "--hostname",
        "0.0.0.0",
        ...process.argv.slice(3),
      ],
      { stdio: "inherit", env: process.env },
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => child.kill(signal));
    child.on("error", () => {
      console.error("تعذر بدء خادم Next.js");
      process.exitCode = 1;
    });
    child.on("exit", (code) => {
      process.exitCode = code ?? 0;
    });
  }
} catch {
  console.error("تعذر التحقق من إعدادات التشغيل");
  process.exitCode = 1;
}
