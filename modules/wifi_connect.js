import { Secret } from "https://deno.land/x/cliffy@v0.25.5/prompt/secret.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { configNetwork } from "../scripts/network.js";


const decoder = new TextDecoder();

/**
 * Lista redes Wi-Fi visíveis (via nmcli ou iwlist)
 */
async function listWiFiNetworks() {
    await configNetwork();

    // Testa se nmcli está disponível
    const nmcli = new Deno.Command("which", { args: ["nmcli"] });
    const { code } = await nmcli.output();

    if (code === 0) {
        // Usa nmcli
        const cmd = new Deno.Command("nmcli", {
            args: ["-t", "-f", "SSID,SIGNAL", "device", "wifi", "list"],
            stdout: "piped",
        });
        const { stdout } = await cmd.output();
        const text = decoder.decode(stdout).trim();

        return text
            .split("\n")
            .filter(Boolean)
            .map(line => {
                const [ssid, signal] = line.split(":");
                return { name: `${ssid || "<oculta>"} (${signal}%)`, value: ssid };
            });
    } else {
        // Fallback: iwlist (modo mais primitivo)
        const cmd = new Deno.Command("bash", {
            args: ["-c", "iwlist scan | grep 'ESSID' | cut -d '\"' -f2"],
            stdout: "piped",
        });
        const { stdout } = await cmd.output();
        const text = decoder.decode(stdout).trim();

        return text
            .split("\n")
            .filter(Boolean)
            .map(ssid => ({ name: ssid, value: ssid }));
    }
}

/**
 * Conecta à rede Wi-Fi escolhida
 */
export async function connectWiFiInteractive() {
    console.log("📡 Buscando redes Wi-Fi...");

    const networks = await listWiFiNetworks();
    if (!networks.length) {
        console.log("❌ Nenhuma rede Wi-Fi encontrada.");
        return;
    }

    const ssid = await Select.prompt({
        message: "Selecione a rede Wi-Fi",
        options: networks,
    });

    const password = await Secret.prompt(`Senha para '${ssid}':`);

    // Usa nmcli (recomendado)
    const cmd = new Deno.Command("nmcli", {
        args: ["device", "wifi", "connect", ssid, "password", password],
        stdout: "piped",
        stderr: "piped",
    });

    const { code, stdout, stderr } = await cmd.output();
    const out = decoder.decode(stdout);
    const err = decoder.decode(stderr);

    if (code === 0) {
        console.log(`✅ Conectado a '${ssid}' com sucesso!`);
    } else {
        console.error(`❌ Falha ao conectar: ${err || out}`);
    }
}
