import { Confirm } from "https://deno.land/x/cliffy@v0.25.5/prompt/confirm.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import { allApps } from "./apps.ts";

export async function choiceDesktop() {
    const confirmed = await Confirm.prompt("Deseja baixar um ambiente gráfico?");

    if (!confirmed) return;

    desktop = await Select.prompt({
        default: desktop || undefined,
        message: "Escolha o ambiente gráfico",
        options: allApps.filter(v => v.category === "Ambientes gráficos").map(v => ({ name: v.name, value: v.value }))
    }) as 'gnome' | 'cinnamon' | null;
}