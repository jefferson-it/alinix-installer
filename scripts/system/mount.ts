import * as path from "https://deno.land/std@0.224.0/path/mod.ts";
import { execCmd } from "./exec.ts";
import { isUEFI } from "../disk/verify.ts";

export async function mountDevices() {
    console.log("Mounting virtual filesystems...");
    const procPath = path.join(tmpFolder, "proc");
    const sysPath = path.join(tmpFolder, "sys");
    const devPath = path.join(tmpFolder, "dev");
    const devPtsPath = path.join(tmpFolder, "dev/pts");
    const runPath = path.join(tmpFolder, "run");

    // Cria diretórios
    Deno.mkdirSync(procPath, { recursive: true });
    Deno.mkdirSync(sysPath, { recursive: true });
    Deno.mkdirSync(devPath, { recursive: true });
    Deno.mkdirSync(devPtsPath, { recursive: true });
    Deno.mkdirSync(runPath, { recursive: true });

    // Montagens básicas
    await execCmd("mount", ["-t", "proc", "proc", procPath]);
    await execCmd("mount", ["--bind", "/sys", sysPath]);
    await execCmd("mount", ["--bind", "/dev", devPath]);
    await execCmd("mount", ["--bind", "/dev/pts", devPtsPath]);
    await execCmd("mount", ["--bind", "/run", runPath]);

    if (await isUEFI()) {
        const efiPath = `${tmpFolder}/sys/firmware/efi`;
        const efiVarsPath = `${efiPath}/efivars`;

        try {
            console.log(" Montando suporte EFI dentro do chroot...");

            // Garante estrutura de diretórios
            await execCmd("mkdir", ["-p", efiVarsPath]);

            // Faz bind de /sys/firmware/efi do host (caso exista)
            if (await Deno.stat("/sys/firmware/efi").catch(() => null)) {
                await execCmd("mount", ["--bind", "/sys/firmware/efi", efiPath]);
            }

            // Se o efivarfs não estiver montado, monta explicitamente
            if (await Deno.stat("/sys/firmware/efi/efivars").catch(() => null)) {
                await execCmd("mount", ["-t", "efivarfs", "efivarfs", efiVarsPath]);
            } else {
                console.log("⚠️  efivars não disponível — pode não ser sistema UEFI real.");
            }

            console.log("[ OK ] EFI/NVRAM montado corretamente para o chroot.");
        } catch (err) {
            console.log("⚠️  Falha ao montar efivars (provavelmente BIOS ou ambiente sem EFI):", (err as { message: string }).message);
        }
    }



    console.log("[ OK ] Sistemas de arquivos virtuais montados para o chroot.");
}