import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { Input } from "https://deno.land/x/cliffy@v0.25.5/prompt/input.ts";
import { Secret } from "https://deno.land/x/cliffy@v0.25.5/prompt/secret.ts";

export default async function RequestUser() {
    console.log("Vamos criar agora o seu usuário, fique atento às perguntas.");

    let confirmUser = false;

    while (!confirmUser) {

        user.name = await Input.prompt("Qual o seu nome completo?\n > ") ?? "";

        const firstPartName = user.name.split(" ")[0];

        user.hostname =
            (await Input.prompt({
                message: "Qual o nome da sua máquina?\n > ",
                default: `Computador-de-${firstPartName}`.toLowerCase()
            })).toLowerCase() ||
            `computador-de-${firstPartName}`;

        let username =
            await Input.prompt({
                message: "Qual o seu usuário?\n > ",
                default: firstPartName.toLowerCase()
            }) ??
            firstPartName.toLowerCase();

        const linuxUserRegex = /^[a-z_][a-z0-9_-]{0,31}$/;

        while (!linuxUserRegex.test(username)) {
            console.log(
                "[ X ] Nome de usuário inválido!\n" +
                "Deve começar com letra minúscula e conter apenas letras, números, '-' ou '_'.\n"
            );
            username =
                await Input.prompt({
                    message: "Tente novamente:\n > ",
                    default: firstPartName.toLowerCase()
                }) ??
                firstPartName.toLowerCase();
        }

        user.username = username;

        const message = `
        \rConfirmar dados:
        \rNome completo: ${user.name}
        \rUsuário: ${user.username}
        \rMáquina: ${user.hostname}
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
            console.log("[ X ] A senha deve ter pelo menos 4 caracteres.");
            continue;
        }

        if (password !== passwordConfirm) {
            console.log("[ X ] As senhas não coincidem. Tente novamente.");
            continue;
        }

        validPassword = true;
    }

    user.password = password;

    console.log("\n[ OK ] Usuário criado com sucesso!");
}
