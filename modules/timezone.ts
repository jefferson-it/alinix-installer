// deno-lint-ignore-file
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";

const brazilTimezones = [
    { name: "Fernando de Noronha", value: "America/Noronha" },
    { name: "Bahia", value: "America/Bahia" },
    { name: "Belém (Pará, Amapá)", value: "America/Belem" },
    { name: "Fortaleza (Ceará, RN, PB, PI)", value: "America/Fortaleza" },
    { name: "Recife (Pernambuco, Alagoas)", value: "America/Recife" },
    { name: "Araguaína (Tocantins)", value: "America/Araguaina" },
    { name: "São Paulo (Sudeste - SP, RJ, MG, ES, DF)", value: "America/Sao_Paulo" },
    { name: "Campo Grande (Mato Grosso do Sul)", value: "America/Campo_Grande" },
    { name: "Cuiabá (Mato Grosso)", value: "America/Cuiaba" },
    { name: "Porto Velho (Rondônia)", value: "America/Porto_Velho" },
    { name: "Boa Vista (Roraima)", value: "America/Boa_Vista" },
    { name: "Manaus (Amazonas - parte leste)", value: "America/Manaus" },
    { name: "Eirunepé (Amazonas - oeste)", value: "America/Eirunepe" },
    { name: "Rio Branco (Acre)", value: "America/Rio_Branco" },
];

export async function choiceTimezone() {
    timezone = await Select.prompt({
        message: "Escolha o fuso horário (no momento só fuso horários brasileiros)",
        options: brazilTimezones
    });
}