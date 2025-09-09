import inquirer from "inquirer";
import chalk from "chalk";
import initializeMovies from "./movies.js";
import initializeSeries from "./series.js";
import initializeChannels from "./channels.js";
import { initializeReset } from "./reset.js";
import api from "uol-simple-api-futebol";

function showBanner() {
  console.log(chalk.greenBright(`
 __   __  __   __  ___          _______  __   __  __    _  _______ 
|  |_|  ||  | |  ||   |        |       ||  | |  ||  |  | ||       |
|       ||  | |  ||   |  ____  |  _____||  |_|  ||   |_| ||       |
|       ||  |_|  ||   | |____| | |_____ |       ||       ||       |
 |     | |       ||   |        |_____  ||_     _||  _    ||      _|
|   _   ||       ||   |         _____| |  |   |  | | |   ||     |_ 
|__| |__||_______||___|        |_______|  |___|  |_|  |__||_______|
  `));
  console.log(chalk.yellowBright("                  🟢 XUI-SYNC - Sincronizador 🟢\n"));
  console.log(chalk.yellowBright("                    🟢 www.xui-managers.site 🟢\n"));
  console.log(chalk.yellowBright("               🟢 http://github.com/xui-managers 🟢\n"));
}

async function mainMenu() {
  showBanner();
  api() //todo

  const { escolha } = await inquirer.prompt([
    {
      type: "list",
      name: "escolha",
      message: "O que você deseja fazer?",
      choices: [
        { name: "📽️  Sincronizar filmes", value: "filmes" },
        { name: "📺  Sincronizar séries", value: "series" },
        { name: "⚠️  Deletar e sincronizar todos os canais", value: "channels" },
        { name: "✨  Sistema de limpeza XUI", value: "reset" },
        { name: "❌  Fechar aplicação", value: "sair" }
      ]
    }
  ]);

  let nova = false;
  if(escolha === 'filmes' || escolha === 'series') {
    // Pergunta adicional (true/false)
    const { nova: response } = await inquirer.prompt([
        {
            type: "confirm",
            name: "nova",
            message: "Deseja marcar como sincronização nova?\nAutomaticamente será limpo o banco de dados desse tipo de stream.",
            default: false
        }
    ]);
    nova = response;
  }

  switch (escolha) {
    case "filmes":
      await initializeMovies(nova);
      break;
    case "series":
      await initializeSeries(nova);
      break;
    case "channels":
      await initializeChannels();
      break;
    case "reset":
      await initializeReset();
      break;
    case "sair":
      console.log("\n👋 Saindo da aplicação...\n");
      process.exit(0);
  }
}

mainMenu();
