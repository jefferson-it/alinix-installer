import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { Secret } from "https://deno.land/x/cliffy@v0.25.5/prompt/secret.ts";
import { execCmd } from "../scripts/install.js";

export default async function RequestUser() {
    console.log("Vamos criar agora o seu usuário, fique atento às perguntas.");

    let confirmUser = false;

    while (!confirmUser) {
        if (!globalThis.sysInfo) globalThis.sysInfo = { user: {} };

        globalThis.user.name = prompt("Qual o seu nome completo?\n > ") ?? "";

        const firstPartName = globalThis.user.name.split(" ")[0];

        globalThis.user.hostname =
            prompt("Qual o nome da sua máquina?\n > ", `Computador-de-${firstPartName}`.toLowerCase())?.toLowerCase() ||
            `computador-de-${firstPartName}`;

        let username =
            prompt("Qual o seu usuário?\n > ", firstPartName.toLowerCase()) ??
            firstPartName.toLowerCase();

        const linuxUserRegex = /^[a-z_][a-z0-9_-]{0,31}$/;

        while (!linuxUserRegex.test(username)) {
            console.log(
                "❌ Nome de usuário inválido!\n" +
                "Deve começar com letra minúscula e conter apenas letras, números, '-' ou '_'.\n"
            );
            username =
                prompt("Tente novamente:\n > ", firstPartName.toLowerCase()) ??
                firstPartName.toLowerCase();
        }

        globalThis.user.username = username;

        const message = `
        \rConfirmar dados:
        \rNome completo: ${globalThis.user.name}
        \rUsuário: ${globalThis.user.username}
        \rMáquina: ${globalThis.user.hostname}
        \rConfirmar? `;

        confirmUser = await Confirm.prompt(message);
    }

    let password = "";
    let passwordConfirm = "";
    let validPassword = false;

    while (!validPassword) {
        password = await Secret.prompt("Digite sua senha:") ?? "";
        passwordConfirm = await Secret.prompt("Confirme sua senha:") ?? "";

        if (password.length < 4) {
            console.log("❌ A senha deve ter pelo menos 4 caracteres.");
            continue;
        }

        if (password !== passwordConfirm) {
            console.log("❌ As senhas não coincidem. Tente novamente.");
            continue;
        }

        validPassword = true;
    }

    globalThis.user.password = password;

    console.log("\n✅ Usuário criado com sucesso!");
}


export async function hashPassword(password) {
    const result = await execCmd('openssl', ['passwd', '-6', password], { capture: true });
    return result.trim();
}
