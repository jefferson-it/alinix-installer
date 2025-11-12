import { existsSync } from "https://deno.land/std@0.224.0/fs/exists.ts";
import { execCmd } from "./exec.ts";

async function findSquashFS() {
    const possiblePaths = [
        "/cdrom/casper/filesystem.squashfs",
        "/mnt/cdrom/casper/filesystem.squashfs",
    ];

    for (const p of possiblePaths) {
        try {
            if (await existsSync(p)) return p;
        } catch (_e) {
            // Ignora erros de permissão, etc.
        }
    }

    // fallback: busca recursiva (agora usando execCmd)
    try {
        const output = await execCmd("find", [
            "/cdrom",
            "/media",
            "-type", "f",
            "-name", "filesystem.squashfs",
        ]);

        const firstResult = output.split("\n")[0];
        if (firstResult) return firstResult;

    } catch (_e) {
        console.error("Falha ao tentar encontrar o squashfs via 'find'");
    }

    return null;
}

export async function extractSquashFS() {
    console.log("Extraindo sistema base...");

    const squashPath = await findSquashFS();
    if (!squashPath) throw new Error("filesystem.squashfs não encontrado!");

    await execCmd("unsquashfs", ["-f", "-d", tmpFolder, squashPath]);
    console.log("Extraído com sucesso em:", tmpFolder);
}
