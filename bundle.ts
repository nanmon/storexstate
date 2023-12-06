Bun.build({
	entrypoints: ["./index.ts", "./react.tsx"],
	outdir: "./build",
	external: ["*"],
}).then(console.log);
