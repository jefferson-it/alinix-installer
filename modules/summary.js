import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import RequestUser from "./users.js";
import ChoiceDisk from "./disk.js";
import { choiceTimezone } from "./timezone.js";
import { choiceApps } from "./apps.js";
import { choiceDesktop } from "./desktop.js";
import { selectUbuntuRepo } from "./ubuntu.js";
import InstallProcess, { execCmd } from "../scripts/install.js";
import { bannerSummary } from "./banner.js";


// Paleta ANSI básica
const colors = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    cyan: "\x1b[36m",
    yellow: "\x1b[33m",
    green: "\x1b[32m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    red: "\x1b[31m",
    gray: "\x1b[90m"
};

export default async function SummaryInstallation() {
    // await execCmd("clear");

    console.log(colors.cyan + bannerSummary + colors.reset);

    // ===========================
    // Usuário
    // ===========================
    console.log(colors.bold + colors.yellow + "======================================" + colors.reset);
    console.log(colors.bold + "|             Usuário                |" + colors.reset);
    console.log(colors.yellow + "======================================" + colors.reset);
    console.log(`${colors.cyan}Nome:${colors.reset} ${user.name}`);
    console.log(`${colors.cyan}Nome da máquina:${colors.reset} ${user.hostname}`);
    console.log(`${colors.cyan}Nome de usuário:${colors.reset} ${user.username}`);
    console.log(`${colors.cyan}Fuso horário:${colors.reset} ${timezone}`);
    console.log(colors.yellow + "======================================\n" + colors.reset);

    // ===========================
    // Repositórios e Apps
    // ===========================
    console.log(colors.bold + colors.yellow + "======================================" + colors.reset);
    console.log(colors.bold + "|      Aplicativos e Repositórios    |" + colors.reset);
    console.log(colors.yellow + "======================================" + colors.reset);
    console.log(`${colors.cyan}Repo Ubuntu:${colors.reset} ${repos?.[0] ?? "Não definido"}`);
    console.log(`${colors.cyan}Ambiente gráfico:${colors.reset} ${desktop ?? "Não selecionado"}`);
    console.log(`${colors.cyan}Aplicativos:${colors.reset} ${apps?.length ? apps.join(", ") : "Nenhum selecionado"}`);
    console.log(colors.yellow + "======================================\n" + colors.reset);

    // ===========================
    // Discos
    // ===========================
    console.log(colors.bold + colors.yellow + "======================================" + colors.reset);
    console.log(colors.bold + "|          🧩 Resumo dos Discos         |" + colors.reset);
    console.log(colors.yellow + "======================================\n" + colors.reset);

    for (const disk of disks) {
        console.log(`${colors.bold}${colors.green}💾 ${disk.name}${colors.reset} (${disk.size} GB)`);
        console.log(colors.gray + "    ├──────────────────────────────────" + colors.reset);

        if (!disk.children || disk.children.length === 0) {
            console.log(colors.red + "    └ Nenhuma partição configurada.\n" + colors.reset);
            continue;
        }

        let sizeLeft = disk.size;
        for (let i = 0; i < disk.children.length; i++) {
            const p = disk.children[i];
            const prefix = i === disk.children.length - 1 ? "    └" : "    ├";

            const eraseText = p.erase
                ? `${colors.red}🧹 formatar${colors.reset}`
                : `${colors.green}📁 manter${colors.reset}`;

            let size = p.size === '100%' ? sizeLeft : Number((p.size / 1_000_000_000).toFixed(2));
            if (isNaN(size)) size = 0;

            console.log(
                `${prefix} ${colors.cyan}${p.name}${colors.reset} → ${colors.yellow}${p.mountPoint || "-"}${colors.reset} | ${size} GB | ${colors.magenta}${p.fileSystem || 'Não usar'}${colors.reset} | ${eraseText}`
            );

            sizeLeft -= size;
        }

    }

    console.log(colors.bold + colors.yellow + "======================================" + colors.reset);
    console.log(colors.bold + "|       Fim do resumo de discos       |" + colors.reset);
    console.log(colors.yellow + "======================================\n" + colors.reset);

    // ===========================
    // Menu de opções
    // ===========================
    const action = await Select.prompt({
        message: "O que deseja fazer agora?",
        options: [
            { name: "🔁 Refazer usuário", value: "user" },
            { name: "💽 Refazer discos", value: "disks" },
            { name: "🌎 Trocar fuso horário", value: "timezone" },
            { name: "📦 Trocar Repositório do Ubuntu", value: "repo" },
            { name: "📦 Trocar aplicativos", value: "apps" },
            { name: "🖥️  Trocar ambiente gráfico", value: "desktop" },
            { name: "🚀 Iniciar instalação", value: "install" }
        ]
    });

    switch (action) {
        case "user":
            await RequestUser();
            break;
        case "disks":
            await ChoiceDisk();
            break;
        case "timezone":
            await choiceTimezone();
            break;
        case "repo":
            await selectUbuntuRepo();
            break;
        case "apps":
            await choiceApps();
            break;
        case "desktop":
            await choiceDesktop();
            break;
        case "install":
            break;
    }

    if (action !== "install") {
        return await SummaryInstallation({ bannerSummary, user, timezone, repos, desktop, apps, disks });
    }

    await InstallProcess()
}
