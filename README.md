# 📦 Channels Synx for XUI.one

Este é um projeto simples feito em Node.js. Ele pode ser usado para sincronizar canais dentro do XUI.one, tanto novos canais como sincronizar a base inteira.

---

## ✅ Requisitos

Antes de começar, você precisa ter instalado no seu computador:

- [Node.js](https://nodejs.org/) (recomendado: versão 19 ou superior)
- Um editor de texto (como o [Visual Studio Code](https://code.visualstudio.com/)) ou qualquer um de sua preferencia
- Conexão com a internet (para instalar os pacotes)

---

## 🚀 Como usar o projeto

Siga os passos abaixo com atenção:

### 1. Faça o download do projeto

Você pode fazer isso de duas formas:

- **Opção 1:** Baixe o ZIP do projeto e extraia em uma pasta.
- **Opção 2:** Se souber usar o Git, rode:
  ```bash
  git clone https://github.com/seu-usuario/seu-projeto.git
  ```

### 2. Renomeie o arquivo .env.example
Este projeto usa um arquivo chamado .env para guardar configurações (como tokens, URLs e senhas).

Encontre o arquivo chamado .env.example para .env

### 3. Abra o arquivo .env e preencha as informações com os seus dados. Exemplo:
```
# Configurações da API Xtream Codes
XTREAM_URL="http://seu-dominio-xtream.com:8080"
XTREAM_USER="seu_usuario_api"
XTREAM_PASS="sua_senha_api"

# Configurações do Banco de Dados MySQL
DB_HOST="localhost"
DB_USER="seu_usuario_db"
DB_PASSWORD="sua_senha_db"
DB_NAME="seu_banco_de_dados"
```

### 4. Abra o terminal ou prompt de comando dentro da pasta do projeto e execute:
`npm install`

Este comando instala todas as bibliotecas que o projeto precisa para funcionar.

### 5. Rode o projeto
Ainda no terminal, execute: `node index.js`

### 6. Licença
Este projeto é livre para uso pessoal e aprendizado.