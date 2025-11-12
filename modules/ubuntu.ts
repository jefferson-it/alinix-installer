import { Select } from "https://deno.land/x/cliffy@v0.25.5/prompt/select.ts";
import * as colors from "https://deno.land/std@0.224.0/fmt/colors.ts";

const repoUbuntu = [
  {
    name: "Oficial Global (principal)",
    value: "http://archive.ubuntu.com/ubuntu/",
    location: "Mundial / principal",
    description:
      "Repositório oficial padrão do Ubuntu, hospedado pela Canonical em servidores internacionais. É a fonte primária de pacotes e base para espelhos regionais."
  },
  {
    name: "Brasil - Mirror oficial (br.archive)",
    value: "http://br.archive.ubuntu.com/ubuntu/",
    location: "Brasil (espelho oficial)",
    description:
      "Espelho regional oficial mantido pela Canonical para usuários brasileiros. Redireciona automaticamente para o mirror mais próximo do Brasil."
  },
  {
    name: "USP (Universidade de São Paulo)",
    value: "http://sft.if.usp.br/ubuntu/",
    location: "São Paulo, Brasil",
    description:
      "Espelho oficial brasileiro mantido pela Universidade de São Paulo (IFUSP). Muito estável e atualizado frequentemente."
  },
  {
    name: "UFSCar (Universidade Federal de São Carlos)",
    value: "http://mirror.ufscar.br/ubuntu/",
    location: "São Carlos, Brasil",
    description:
      "Espelho brasileiro oficial mantido pela UFSCar. Também listado entre os mirrors oficiais do Ubuntu no Launchpad."
  },
  {
    name: "LetsCloud Brasil",
    value: "https://ubuntu.mirror.letscloud.io/",
    location: "São Paulo, Brasil",
    description:
      "Espelho moderno e rápido hospedado pela LetsCloud, empresa brasileira de cloud computing. Fornece excelente desempenho em conexões nacionais."
  },
];

export async function selectUbuntuRepo() {
  await Promise.all(
    repoUbuntu.map(async ({ value }, ind) => {
      const start = performance.now();
      try {
        await fetch(value, { method: "HEAD" });
        const latency = performance.now() - start;
        let colorFn;

        if (latency < 80) colorFn = colors.green;
        else if (latency < 200) colorFn = colors.yellow;
        else colorFn = colors.red;

        repoUbuntu[ind].name += ` ${colorFn(`(${latency.toFixed(0)}ms)`)}`;
      } catch {
        repoUbuntu[ind].name += " " + colors.gray("(falhou)");
      }
    })
  );

  const ubuntuRepo = await Select.prompt({
    message: "Escolha o repositório ubuntu padrão",
    options: repoUbuntu,
    default: repoUbuntu[0].value
  });


  repos.push(ubuntuRepo);
}