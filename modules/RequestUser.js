import { promptSecret } from "https://deno.land/x/prompts/mod.ts";



export default function RequestUser() {
    console.log("Vamos criar agora o seu usuário, fique atento às perguntas.");

    if (!globalThis.sysInfo) globalThis.sysInfo = { user: {} };

    globalThis.user.name = prompt("Qual o seu nome completo?\n > ") ?? "";

    const firstPartName = globalThis.user.name.split(" ")[0] || "usuario";

    globalThis.user.hostname = prompt(
        "Qual o nome da sua máquina?\n > ",
        `Computador-de-${firstPartName}`
    ) ?? `Computador-de-${firstPartName}`.toLowerCase();

    let username = prompt(
        "Qual o seu usuário?\n > ",
        firstPartName.toLowerCase()
    ) ?? firstPartName.toLowerCase();

    const linuxUserRegex = /^[a-z_][a-z0-9_-]{0,31}$/;

    while (!linuxUserRegex.test(username)) {
        console.log(
            "❌ Nome de usuário inválido!\n" +
            "Deve começar com letra minúscula e conter apenas letras, números, '-' ou '_'.\n"
        );
        username = prompt("Tente novamente:\n > ", firstPartName.toLowerCase()) ?? firstPartName.toLowerCase();
    }

    globalThis.user.username = username;


    console.log(`
    \rConfirmar dados:
    \rNome completo: ${user.name}
    \rNome usuário: ${user.username}
    \rNome da maquina: ${user.hostname}
    `);


    const password = promptSecret('Digite sua senha:');

}
