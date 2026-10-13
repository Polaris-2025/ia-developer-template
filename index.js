require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { 
    Client, 
    GatewayIntentBits, 
    Events,
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    StringSelectMenuBuilder, 
    StringSelectMenuOptionBuilder, 
    ChannelType, 
    PermissionFlagsBits,
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, setDoc, getDoc, updateDoc, increment } = require('firebase/firestore');
const Groq = require('groq-sdk');

// --- CONFIGURAÇÕES VISUAIS E CATEGORIA ---
const URL_IMAGEM_PAINEL = 'https://github.com/Polaris-2025/Central-de-Criadores/blob/main/ChatGPT%20Image%202%20de%20jul.%20de%202026,%2013_10_43.png?raw=true';
const NOME_CATEGORIA_IA = '🌐︱ INTELIGÊNCIA ARTIFICIAL';

// Função com busca direta e auto-criação/organização em categoria
async function obterOuCriarCategoriaIA(guild) {
    if (!guild) return null;
    try {
        let channels = guild.channels.cache;
        let categoria = channels.find(c => 
            c.type === ChannelType.GuildCategory && 
            (c.name.trim().toLowerCase() === NOME_CATEGORIA_IA.trim().toLowerCase() || 
             c.name.toLowerCase().includes('inteligência artificial') ||
             c.name.toLowerCase().includes('inteligencia artificial') ||
             c.id === NOME_CATEGORIA_IA)
        );

        if (!categoria) {
            const fetched = await guild.channels.fetch().catch(() => null);
            if (fetched) {
                categoria = fetched.find(c => 
                    c && c.type === ChannelType.GuildCategory && 
                    (c.name.trim().toLowerCase() === NOME_CATEGORIA_IA.trim().toLowerCase() || 
                     c.name.toLowerCase().includes('inteligência artificial') ||
                     c.name.toLowerCase().includes('inteligencia artificial') ||
                     c.id === NOME_CATEGORIA_IA)
                );
            }
        }

        if (!categoria) {
            categoria = await guild.channels.create({
                name: NOME_CATEGORIA_IA,
                type: ChannelType.GuildCategory
            });
            console.log(`📁 [Categoria Criada]: ${categoria.name}`);
        }

        return categoria;
    } catch (e) {
        console.error("Erro ao obter/criar categoria:", e.message);
        return null;
    }
}

// --- INICIALIZAÇÃO E AUTO-DETECÇÃO SEGURA DO GROQ ---
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY?.trim() });

const modelosPrioritarios = [
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant'
];
let modelosDisponiveis = [...modelosPrioritarios];
let indiceModeloAtual = 0;

async function atualizarListaModelosGroq() {
    try {
        const lista = await groq.models.list();
        const idsDisponiveis = lista.data.map(m => m.id);
        
        const detectados = modelosPrioritarios.filter(id => idsDisponiveis.includes(id));
        if (detectados.length > 0) {
            modelosDisponiveis = detectados;
            indiceModeloAtual = 0;
            console.log(`🎯 [Modelos Groq Ativos]: ${modelosDisponiveis.join(', ')}`);
        }
    } catch (e) {
        console.log(`⚠️ Usando lista padrão estável da Groq.`);
    }
}

async function chamarGroqRobusto(messages, options = {}) {
    const totalModelos = modelosDisponiveis.length;
    for (let i = 0; i < totalModelos; i++) {
        const modeloTeste = modelosDisponiveis[indiceModeloAtual];
        try {
            const completion = await groq.chat.completions.create({
                model: modeloTeste,
                messages: messages,
                temperature: options.temperature ?? 0.65,
                max_tokens: options.max_tokens ?? 4096
            });
            if (completion?.choices?.[0]?.message?.content) {
                return completion;
            }
        } catch (erro) {
            console.error(`⚠️ Falha no modelo [${modeloTeste}]: ${erro.status || erro.message}`);
            indiceModeloAtual = (indiceModeloAtual + 1) % totalModelos;
        }
    }
    return null;
}

const processedMessages = new Set();
const activeProcessingChannels = new Set();
const cacheCodigosGerados = new Map();

// --- MAPA UNIVERSAL DE EXTENSÕES ---
function obterExtensaoArquivo(linguagem) {
    const lang = (linguagem || '').toLowerCase().trim();
    switch (lang) {
        case 'lua':
        case 'luau': return 'luau';
        case 'html': return 'html';
        case 'css': return 'css';
        case 'js':
        case 'javascript': return 'js';
        case 'ts':
        case 'typescript': return 'ts';
        case 'json': return 'json';
        case 'py':
        case 'python': return 'py';
        case 'csharp':
        case 'cs': return 'cs';
        case 'cpp':
        case 'c++': return 'cpp';
        case 'c': return 'c';
        case 'rust':
        case 'rs': return 'rs';
        case 'gdscript':
        case 'gd': return 'gd';
        case 'java': return 'java';
        case 'go':
        case 'golang': return 'go';
        case 'php': return 'php';
        case 'sql': return 'sql';
        case 'sh':
        case 'bash': return 'sh';
        default: return 'luau';
    }
}

// --- DIVISÃO DE CÓDIGOS EXTENSOS ---
function dividirCodigoEmBlocos(codigo, tamanhoMax = 3200) {
    if (codigo.length <= tamanhoMax) return [codigo];
    const blocos = [];
    const linhas = codigo.split('\n');
    let blocoAtual = '';

    for (const linha of linhas) {
        if ((blocoAtual + '\n' + linha).length > tamanhoMax) {
            if (blocoAtual) blocos.push(blocoAtual);
            blocoAtual = linha;
        } else {
            blocoAtual = blocoAtual ? blocoAtual + '\n' + linha : linha;
        }
    }
    if (blocoAtual) blocos.push(blocoAtual);
    return blocos;
}

// --- PROMPTS DE ALTA PERFORMANCE E CONTEXTO ---
const SYSTEM_CHAT = `Você é a "I.A Developer", inteligência artificial e Engenheira de Software Multilinguagem criada por Polaris em co-desenvolvimento com o Gemini.

PERSONALIDADE & CONDUTA:
- Seja acolhedora, simpática, paciente e perspicaz.
- Compreenda com precisão o contexto completo da conversa, conectando pontos de mensagens anteriores.
- REGRA DE VERBOSIDADE ADAPTATIVA: Seja concisa, prática e direta em conversas comuns. Fale de forma extensa e detalhada APENAS quando o usuário pedir explicações aprofundadas, tutoriais passo a passo ou sistemas complexos.
- LINGUAGEM FLUIDA & ANTI-REPETIÇÃO: Varie seu vocabulário dinamicamente, sem repetir termos ou frases. NUNCA use frases automáticas ou clichês no encerramento (como "estou à disposição", "se precisar...", etc.).
- CONHECIMENTO UNIVERSAL: Domine desenvolvimento de jogos (Roblox Studio Luau, Unity C#, Unreal C++, Godot GDScript, Pygame, Three.js), Web Fullstack, Mobile, Banco de Dados e Lógica Avançada.
- NUNCA use blocos de código formatados com crases (\`\`\`) em conversas teóricas normais.`;

const SYSTEM_CODER = `Você é a "I.A Developer", Engenheira de Software Sênior e Game Designer Especialista Poliglota.

DIRETRIZES DE ENGENHARIA E CÓDIGO:
1. DOMÍNIO UNIVERSAL DE JOGOS & CÓDIGOS: Você é capaz de projetar e entregar jogos, sites, apps e sistemas completos do zero em QUALQUER linguagem (Luau para Roblox, C#, C++, Python, GDScript, JS/TS, Rust, Java, etc.).
2. CÓDIGO 100% COMPLETO E FUNCIONAL: NUNCA use reticências (...), "adicione aqui", atalhos ou código cortado. Gere toda a lógica, mecânicas, interfaces, variáveis e funções inteiramente prontas para execução.
3. MODULARIDADE E SEPARAÇÃO: Se o projeto exigir múltiplos arquivos (ex: ServerScript, LocalScript e ModuleScript no Roblox; ou HTML, CSS e JS na Web), separe cada um em um bloco formatado com sua linguagem respectiva (\`\`\`lua ... \`\`\`, \`\`\`javascript ... \`\`\`).
4. SEM COMENTÁRIOS EXCETO SE PEDIDO: Forneça código limpo, puro e otimizado. Só adicione comentários internos de aprendizado se o usuário pedir expressamente "comentado" ou "comente o código".
5. GUIA EXTERNO SUCINTO: Fora dos blocos de código, apresente apenas as instruções práticas essenciais de onde alocar cada arquivo no projeto ou Explorer. Sem enrolações.`;

function limparRespostaIA(texto) {
    if (!texto || typeof texto !== 'string') return '';
    return texto
        .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
        .replace(/^(\*\*?I\.A Developer\*\*?|\*\*?I\.A\*\*?|IA Developer|IA|Polaris|Assistente)\s*[:|-]\s*/i, '')
        .trim();
}

// --- FIREBASE FIRESTORE ---
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY?.trim(),
    authDomain: process.env.FIREBASE_AUTH_DOMAIN?.trim(),
    projectId: process.env.FIREBASE_PROJECT_ID?.trim(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET?.trim(),
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID?.trim(),
    appId: process.env.FIREBASE_APP_ID?.trim()
};
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- DISCORD CLIENT ---
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent
    ] 
});

client.once(Events.ClientReady, async () => {
    await atualizarListaModelosGroq();
    console.log(`🚀 [I.A Developer] Online e operacional como ${client.user.tag}`);
});

function getDataHoje() {
    return new Date().toISOString().split('T')[0];
}

function verificarAssinaturaValida(userData) {
    if (!userData) return { status: 'nao_cadastrado' };
    if (userData.plano === 'cancelado') return { status: 'cancelado' };

    if (userData.plano === 'Plus' || userData.plano === 'Premium Ilimitado') {
        if (userData.dataExpiracao) {
            const expiracao = new Date(userData.dataExpiracao);
            if (new Date() > expiracao) {
                return { status: 'expirado', dataExp: expiracao.toLocaleDateString('pt-BR') };
            }
            return { status: 'plus', tipo: 'mensal', dataExp: expiracao.toLocaleDateString('pt-BR') };
        }
        return { status: 'plus', tipo: 'vitalicio' };
    }

    const hoje = getDataHoje();
    let codigosHoje = userData.codigosGeradosHoje || 0;

    if (userData.dataUltimoUso !== hoje) {
        codigosHoje = 0;
    }

    return { 
        status: 'gratis', 
        codigosUsados: codigosHoje, 
        codigosRestantes: Math.max(0, 10 - codigosHoje)
    };
}

// --- PAINÉIS PRINCIPAIS ---
function gerarPainelPrincipal() {
    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('⚡ I.A Developer — Central Oficial de Desenvolvimento')
        .setDescription(
            'Bem-vindo à **I.A Developer**, sua parceira inteligente especializada em desenvolvimento e engenharia para Roblox Studio, Web, Jogos e Softwares completos!\n\n' +
            'Desenvolvida por **Polaris** em co-desenvolvimento com o **Gemini**.\n\n' +
            '🆓 **Plano Grátis:**\n' +
            '• Chat de texto com a I.A ilimitado\n' +
            '• Geração de até **10 Projetos/Códigos completos** por dia\n' +
            '• Painéis interativos com cópia, download de arquivo e edição modal\n\n' +
            '👑 **Plano Plus (Apenas R$ 10,00/mês):**\n' +
            '• Geração de Códigos, Jogos e Projetos 100% Ilimitados\n' +
            '• Sem tempo de espera ou cotas diárias de scripts\n' +
            '• Suporte e assistência técnica prioritária contínua'
        )
        .setThumbnail(URL_IMAGEM_PAINEL)
        .setFooter({ text: 'I.A Developer • Polaris & Gemini' });

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_iniciar_cadastro').setLabel('Criar Conta Grátis').setStyle(ButtonStyle.Primary).setEmoji('✨'),
        new ButtonBuilder().setCustomId('btn_entrar').setLabel('Entrar / Meu Painel').setStyle(ButtonStyle.Success).setEmoji('🔐'),
        new ButtonBuilder().setCustomId('btn_abrir_menu_info').setLabel('Conhecer a I.A & Planos').setStyle(ButtonStyle.Secondary).setEmoji('ℹ️')
    );

    return { embeds: [embed], components: [botoes] };
}

function gerarPainelAdmin() {
    const embed = new EmbedBuilder()
        .setColor('#e74c3c')
        .setTitle('🛠️ Painel de Administração Ativo')
        .setDescription(
            'Comandos administrativos disponíveis no servidor:\n\n' +
            '• `!vitalicio @usuario` — Concede Plano Plus Vitalício/Permanente (Sem expiração).\n' +
            '• `!aprovar @usuario` — Concede 30 dias de Plano Plus.\n' +
            '• `!cancelar @usuario` — Cancela e bloqueia o plano do usuário.\n' +
            '• `!resetar @usuario` — Reseta a cota diária de códigos do usuário.\n' +
            '• `!status @usuario` — Consulta cota, tipo de plano e validade do usuário.'
        )
        .setFooter({ text: 'Acesso Restrito a Administradores' });

    return { embeds: [embed] };
}

function gerarTermosLGPD() {
    const embed = new EmbedBuilder()
        .setColor('#e67e22')
        .setTitle('📜 Termos de Uso e Privacidade')
        .setDescription(
            'Para abrir seu canal privado de desenvolvimento:\n\n' +
            '• Armazenamos apenas seu ID do Discord para contagem de cotas diárias.\n' +
            '• Seus scripts e projetos são processados com isolamento seguro.\n' +
            '• É expressamente proibida a criação de conteúdos impróprios ou maliciosos.\n\n' +
            'Clique no botão abaixo para concordar e criar seu espaço.'
        );

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_aceitar_lgpd').setLabel('✅ Aceitar e Continuar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_recusar_lgpd').setLabel('❌ Cancelar').setStyle(ButtonStyle.Danger)
    );
    return { embeds: [embed], components: [botoes] };
}

function gerarMenuInformativo(aba = 'geral') {
    const menuSelect = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('menu_info_select')
            .setPlaceholder('Selecione um tópico informativo...')
            .addOptions([
                new StringSelectMenuOptionBuilder().setLabel('Autoria & Desenvolvimento').setValue('info_polaris').setEmoji('👑'),
                new StringSelectMenuOptionBuilder().setLabel('Tecnologia Operacional').setValue('info_tecnologia').setEmoji('🧠'),
                new StringSelectMenuOptionBuilder().setLabel('Planos: Grátis vs Plus').setValue('info_planos_detalhes').setEmoji('💎'),
                new StringSelectMenuOptionBuilder().setLabel('Segurança & Dados').setValue('info_seguranca').setEmoji('🛡️')
            ])
    );

    const botaoVoltar = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_voltar_painel_principal').setLabel('Voltar ao Início').setStyle(ButtonStyle.Secondary).setEmoji('🏠')
    );

    let embed = new EmbedBuilder().setColor('#00d2d3');

    switch (aba) {
        case 'info_polaris':
            embed.setTitle('👑 Autoria e Desenvolvimento')
                .setDescription('Desenvolvida e concebida por **Polaris**, em co-desenvolvimento com a inteligência artificial **Gemini**.');
            break;
        case 'info_tecnologia':
            embed.setTitle('🧠 Arquitetura')
                .setDescription('Infraestrutura de alta velocidade Groq (motores ultrarrápidos de última geração) com processamento contextual aprofundado e engenharia poliglota completa.');
            break;
        case 'info_planos_detalhes':
            embed.setTitle('💎 Comparativo Oficial de Planos')
                .setDescription(
                    '🆓 **Plano Grátis:**\n' +
                    '• Chat de texto ilimitado\n' +
                    '• 10 Códigos/Sistemas completos por dia\n' +
                    '• Painéis com cópia, download de arquivo e edição modal\n\n' +
                    '👑 **Plano Plus (R$ 10,00/mês):**\n' +
                    '• Códigos, Jogos e Sistemas 100% Ilimitados\n' +
                    '• Suporte prioritário contínuo'
                );
            break;
        case 'info_seguranca':
            embed.setTitle('🛡️ Segurança')
                .setDescription('Persistência segura em Firebase Firestore. Nenhum dado é repassado a terceiros.');
            break;
        default:
            embed.setTitle('ℹ️ Central de Informações').setDescription('Selecione uma categoria no menu acima para conhecer os detalhes do projeto.');
            break;
    }

    return { embeds: [embed], components: [menuSelect, botaoVoltar] };
}

function gerarBoasVindasCanal(userId) {
    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('👋 Central de Engenharia & Desenvolvimento')
        .setDescription(
            `Espaço de desenvolvimento pronto, <@${userId}>!\n\n` +
            '💬 **Chat de Texto:** Ilimitado\n' +
            '💻 **Geração de Códigos/Projetos:** 10 por dia no Grátis (Ilimitado no Plus)\n' +
            '🛠️ **Painéis Interativos:** Copie, baixe arquivos ou edite código diretamente\n\n' +
            '👇 Peça qualquer sistema, jogo ou site para começar a programar!'
        )
        .setFooter({ text: 'I.A Developer • Painéis Interativos 100% Completos' });

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_ver_planos_direto').setLabel('👑 Assinar Plano Plus (R$ 10,00)').setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [botoes] };
}

function gerarPainelPlanos() {
    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('💎 Assinatura Plano Plus')
        .setDescription(
            'Desbloqueie todo o potencial da **I.A Developer** por apenas **R$ 10,00 / mês**:\n\n' +
            '✨ **Geração de Códigos/Jogos 100% Ilimitada**\n' +
            '⚡ **Atendimento Prioritário em Tempo Real**\n' +
            '🚀 **Sem Limite Diário de Scripts**\n\n' +
            'Apoie o projeto e desenvolva sem restrições!'
        )
        .setFooter({ text: 'Ativação instantânea via PIX' });

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_plano_plus_pix').setLabel('Pagar com PIX (R$ 10,00)').setStyle(ButtonStyle.Success).setEmoji('👑')
    );

    return { embeds: [embed], components: [botoes] };
}

function gerarTelaPix() {
    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('💳 Pagamento do Plano Plus via PIX')
        .setDescription(
            'Transfira o valor de **R$ 10,00** para a chave:\n\n' +
            '**Chave PIX (E-mail):**\n\`pollaressy@gmail.com\`\n\n' +
            'Após efetuar o pagamento, envie o comprovante para a administração aprovar sua conta.'
        );

    const botoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_voltar_planos').setLabel('Voltar').setStyle(ButtonStyle.Danger).setEmoji('⬅️')
    );

    return { embeds: [embed], components: [botoes] };
}

// --- PROCESSAMENTO DE MENSAGENS ---
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => { processedMessages.delete(message.id); }, 120000);

    // COMANDOS ADMINISTRATIVOS
    if (message.content === '!admin') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return message.reply('❌ Restrito a administradores.');
        const painelAdm = gerarPainelAdmin();
        return message.channel.send({ embeds: painelAdm.embeds });
    }

    if (message.content.startsWith('!vitalicio') || message.content.startsWith('!perm')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠️ Uso: `!vitalicio @usuario`');

        await setDoc(doc(db, 'usuarios', usuario.id), { 
            plano: 'Plus', 
            dataExpiracao: null 
        }, { merge: true });

        return message.reply(`👑 <@${usuario.id}> agora possui **Plano Plus Vitalício / Permanente** (Sem expiração e 100% Ilimitado)!`);
    }

    if (message.content.startsWith('!aprovar')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠️ Uso: `!aprovar @usuario`');

        const dataExpiracao = new Date(Date.now() + (30 * 24 * 60 * 60 * 1000));
        await setDoc(doc(db, 'usuarios', usuario.id), { plano: 'Plus', dataExpiracao: dataExpiracao.toISOString() }, { merge: true });
        return message.reply(`🎉 <@${usuario.id}> agora é **Plano Plus (30 dias)** até ${dataExpiracao.toLocaleDateString('pt-BR')}!`);
    }

    if (message.content.startsWith('!cancelar')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠️ Uso: `!cancelar @usuario`');

        await setDoc(doc(db, 'usuarios', usuario.id), { plano: 'cancelado' }, { merge: true });
        return message.reply(`🚫 Acesso de <@${usuario.id}> foi cancelado.`);
    }

    if (message.content.startsWith('!resetar')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠️ Uso: `!resetar @usuario`');

        await updateDoc(doc(db, 'usuarios', usuario.id), { codigosGeradosHoje: 0, dataUltimoUso: getDataHoje() }).catch(() => {});
        return message.reply(`🔄 Cotas de <@${usuario.id}> foram restauradas.`);
    }

    if (message.content.startsWith('!status')) {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        const usuario = message.mentions.users.first();
        if (!usuario) return message.reply('⚠️ Uso: `!status @usuario`');

        const userSnap = await getDoc(doc(db, 'usuarios', usuario.id));
        if (!userSnap.exists()) return message.reply('❌ Usuário não cadastrado.');
        const status = verificarAssinaturaValida(userSnap.data());

        let detalhesPlano = '🆓 Grátis';
        if (status.status === 'plus') {
            detalhesPlano = status.tipo === 'vitalicio' 
                ? '👑 Plus Vitalício / Permanente' 
                : `👑 Plus Mensal (Expira em: ${status.dataExp})`;
        } else if (status.status === 'cancelado') {
            detalhesPlano = '🚫 Cancelado / Bloqueado';
        }

        return message.reply(
            `📊 **Status de <@${usuario.id}>:**\n` +
            `• Plano: **${detalhesPlano}**\n` +
            `• Códigos gerados hoje: **${status.codigosUsados || 0}/10**`
        );
    }

    if (message.content === '!painel') {
        if (message.channel.name.startsWith('ia-')) {
            const painelPrivado = gerarBoasVindasCanal(message.author.id);
            return message.channel.send({ embeds: painelPrivado.embeds, components: painelPrivado.components });
        }
        const painel = gerarPainelPrincipal();
        return message.channel.send({ embeds: painel.embeds, components: painel.components });
    }

    if (message.content === '!sobre') {
        const menu = gerarMenuInformativo();
        return message.channel.send({ embeds: menu.embeds, components: menu.components });
    }

    // PROCESSAMENTO NO CANAL PRIVADO (ia-nomeusuario)
    if (message.channel.name.startsWith('ia-')) {
        if (activeProcessingChannels.has(message.channel.id)) return;
        activeProcessingChannels.add(message.channel.id);

        await message.channel.sendTyping();
        const typingLoop = setInterval(() => { message.channel.sendTyping().catch(() => {}); }, 3000);

        try {
            const userRef = doc(db, 'usuarios', message.author.id);
            const userSnap = await getDoc(userRef);
            const statusAssinatura = verificarAssinaturaValida(userSnap.exists() ? userSnap.data() : null);

            if (statusAssinatura.status === 'nao_cadastrado' || statusAssinatura.status === 'cancelado') {
                clearInterval(typingLoop);
                activeProcessingChannels.delete(message.channel.id);
                return message.reply('🔒 Conta não localizada ou suspensa. Digite `!painel` no canal público para começar.');
            }

            const msgTexto = message.content.toLowerCase().trim();

            const pedeScript = /(crie|cria|faça|faz|gerar|gere|escreva|desenvolva|programe|monte|manda|cadê|fazer|construa|montar)\s+(um|o|uns|uma)?\s*(script|codigo|código|sistema|mecanica|mecânica|gui|menu|jogo|game|site|pagina|app|aplicativo|api|backend|frontend|bot)/i.test(msgTexto) ||
                               /(script|codigo|código|jogo|site|app)\s+(de|para|em|que)/i.test(msgTexto) ||
                               /(html|css|javascript|python|luau|lua|csharp|react|nodejs|c\+\+|rust|gdscript|unity|unreal|godot)/i.test(msgTexto);

            if (pedeScript && statusAssinatura.status === 'gratis' && statusAssinatura.codigosRestantes <= 0) {
                clearInterval(typingLoop);
                activeProcessingChannels.delete(message.channel.id);
                const painelPlanos = gerarPainelPlanos();
                return message.reply({ 
                    content: '⚠️ **Você atingiu o limite diário de 10 gerações do Plano Grátis.**\nVocê pode continuar tirando dúvidas teóricas no chat normalmente ou assinar o **Plano Plus (R$ 10,00)** para gerações ilimitadas!', 
                    embeds: painelPlanos.embeds, 
                    components: painelPlanos.components 
                });
            }

            const instrucaoEscolhida = pedeScript ? SYSTEM_CODER : SYSTEM_CHAT;

            const fetched = await message.channel.messages.fetch({ limit: 6 });
            const historico = [];

            fetched.reverse().forEach(msg => {
                if (msg.content.startsWith('!') || msg.content.startsWith('🔒')) return;
                const limpo = msg.cleanContent.replace(/```[\s\S]*?```/g, '[código do painel]').slice(0, 500).trim();
                if (!limpo) return;

                if (msg.author.id === client.user.id) historico.push({ role: 'assistant', content: limpo });
                else if (!msg.author.bot) historico.push({ role: 'user', content: limpo });
            });

            if (!historico.some(h => h.role === 'user' && h.content === message.content.trim())) {
                historico.push({ role: 'user', content: message.content.trim() });
            }

            const completion = await chamarGroqRobusto([
                { role: 'system', content: instrucaoEscolhida },
                ...historico
            ], {
                temperature: pedeScript ? 0.15 : 0.65,
                max_tokens: pedeScript ? 4096 : 900
            });

            let respostaIA = limparRespostaIA(completion?.choices?.[0]?.message?.content || "");
            clearInterval(typingLoop);

            if (!respostaIA) {
                respostaIA = "Ocorreu uma instabilidade na conexão com o modelo. Por favor, tente enviar novamente.";
            }

            // --- PROCESSAMENTO DE PAINÉIS DE CÓDIGO (100% NO PAINEL, CÓPIA, DOWNLOAD E EDIÇÃO) ---
            const regexBlocos = /```([a-zA-Z0-9_+#-]*)\s*([\s\S]*?)```/g;
            const blocosEncontrados = [...respostaIA.matchAll(regexBlocos)];

            if (blocosEncontrados.length > 0 && pedeScript) {
                if (statusAssinatura.status === 'gratis') {
                    await updateDoc(userRef, {
                        codigosGeradosHoje: increment(1),
                        dataUltimoUso: getDataHoje()
                    }).catch(() => {});
                }

                const textoPassos = respostaIA.replace(/```[a-zA-Z0-9_+#-]*\s*[\s\S]*?```/g, '').trim();
                if (textoPassos) {
                    if (textoPassos.length <= 1900) {
                        await message.reply(`📖 **Instruções de Instalação:**\n\n${textoPassos}`);
                    } else {
                        const partesTexto = textoPassos.match(/[\s\S]{1,1900}/g) || [];
                        for (let p of partesTexto) {
                            await message.channel.send(p);
                        }
                    }
                }

                let arquivoIndice = 1;
                for (const match of blocosEncontrados) {
                    const linguagem = match[1] || 'luau';
                    const codigoCompleto = match[2].trim();
                    const extensao = obterExtensaoArquivo(linguagem);
                    const nomeArquivo = `arquivo_${arquivoIndice}.${extensao}`;

                    const idCodigoUnico = crypto.randomUUID().slice(0, 8);
                    cacheCodigosGerados.set(idCodigoUnico, { codigo: codigoCompleto, lang: linguagem, etapa: arquivoIndice });
                    setTimeout(() => { cacheCodigosGerados.delete(idCodigoUnico); }, 30 * 60 * 1000);

                    const bufferArquivo = Buffer.from(codigoCompleto, 'utf-8');
                    const anexoArquivo = new AttachmentBuilder(bufferArquivo, { name: nomeArquivo });

                    const fatiasCodigo = dividirCodigoEmBlocos(codigoCompleto, 3200);

                    for (let i = 0; i < fatiasCodigo.length; i++) {
                        const fatiaAtual = fatiasCodigo[i];
                        const totalPartes = fatiasCodigo.length;
                        const rotuloParte = totalPartes > 1 ? ` (Parte ${i + 1} de ${totalPartes})` : '';

                        const embedPainel = new EmbedBuilder()
                            .setColor('#00b894')
                            .setTitle(`💻 Painel de Código — ${nomeArquivo}${rotuloParte} [${linguagem.toUpperCase()}]`)
                            .setDescription(`\`\`\`${linguagem}\n${fatiaAtual}\n\`\`\``)
                            .setFooter({ text: `Arquivo: ${nomeArquivo} • 100% do código no painel` });

                        const botoesPainel = new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`btn_copiar_codigo_${idCodigoUnico}`)
                                .setLabel('📋 Copiar Código')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId(`btn_baixar_codigo_${idCodigoUnico}`)
                                .setLabel('📥 Baixar Arquivo')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId(`btn_editar_codigo_${idCodigoUnico}`)
                                .setLabel('✏️ Editar Código')
                                .setStyle(ButtonStyle.Secondary)
                        );

                        if (i === 0) {
                            await message.channel.send({ embeds: [embedPainel], files: [anexoArquivo], components: [botoesPainel] });
                        } else {
                            await message.channel.send({ embeds: [embedPainel], components: [botoesPainel] });
                        }
                    }

                    arquivoIndice++;
                }

                return;
            }

            if (respostaIA.length <= 1900) {
                await message.reply(respostaIA);
            } else {
                const chunks = respostaIA.match(/[\s\S]{1,1900}/g) || [];
                for (let i = 0; i < chunks.length; i++) {
                    if (i === 0) await message.reply(chunks[i]);
                    else await message.channel.send(chunks[i]);
                }
            }

        } catch (erro) {
            clearInterval(typingLoop);
            await message.reply("Ocorreu uma instabilidade. Por favor, tente novamente.");
        } finally {
            activeProcessingChannels.delete(message.channel.id);
        }
    }
});

// --- GESTÃO DE INTERAÇÕES: MODAL, CÓPIA, DOWNLOAD E MENUS ---
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_editar_codigo_')) {
            const idCodigo = interaction.customId.replace('modal_editar_codigo_', '');
            const novoCodigo = interaction.fields.getTextInputValue('input_codigo_editado');
            const itemCache = cacheCodigosGerados.get(idCodigo);

            if (!itemCache) {
                return interaction.reply({ content: '⚠️ O código original expirou da memória temporária.', flags: [1 << 6] });
            }

            itemCache.codigo = novoCodigo;
            cacheCodigosGerados.set(idCodigo, itemCache);

            const extensao = obterExtensaoArquivo(itemCache.lang);
            const nomeArquivo = `arquivo_${itemCache.etapa || 1}_editado.${extensao}`;
            const novoAnexo = new AttachmentBuilder(Buffer.from(novoCodigo, 'utf-8'), { name: nomeArquivo });

            const previaCodigo = novoCodigo.length > 3200 
                ? novoCodigo.slice(0, 3200) + `\n\n-- [Código completo editado no arquivo .${extensao} anexo]` 
                : novoCodigo;

            const embedAtualizado = new EmbedBuilder()
                .setColor('#e67e22')
                .setTitle(`✏️ Painel de Código [EDITADO] — ${nomeArquivo} [${itemCache.lang.toUpperCase()}]`)
                .setDescription(`\`\`\`${itemCache.lang}\n${previaCodigo}\n\`\`\``)
                .setFooter({ text: `Editado recentemente • Arquivo: ${nomeArquivo}` });

            await interaction.update({ embeds: [embedAtualizado], files: [novoAnexo] });
            return;
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'menu_info_select') {
            await interaction.deferUpdate(); 
            const menuAtualizado = gerarMenuInformativo(interaction.values[0]);
            await interaction.editReply({ embeds: menuAtualizado.embeds, components: menuAtualizado.components });
            return;
        }

        if (!interaction.isButton()) return;

        if (interaction.customId.startsWith('btn_editar_codigo_')) {
            const idCodigo = interaction.customId.replace('btn_editar_codigo_', '');
            const itemCache = cacheCodigosGerados.get(idCodigo);

            if (!itemCache) {
                return interaction.reply({ content: '⚠️ Este código expirou da memória. Peça a geração novamente.', flags: [1 << 6] });
            }

            const modal = new ModalBuilder()
                .setCustomId(`modal_editar_codigo_${idCodigo}`)
                .setTitle(`Editar Código (Arquivo ${itemCache.etapa || 1})`);

            const inputCodigo = new TextInputBuilder()
                .setCustomId('input_codigo_editado')
                .setLabel('Edite o código abaixo:')
                .setStyle(TextInputStyle.Paragraph)
                .setValue(itemCache.codigo.slice(0, 3950))
                .setRequired(true);

            const primeiraLinha = new ActionRowBuilder().addComponents(inputCodigo);
            modal.addComponents(primeiraLinha);

            await interaction.showModal(modal);
            return;
        }

        if (interaction.customId.startsWith('btn_copiar_codigo_')) {
            const idCodigo = interaction.customId.replace('btn_copiar_codigo_', '');
            const itemCache = cacheCodigosGerados.get(idCodigo);

            if (!itemCache) {
                return interaction.reply({ content: '⚠️ O código expirou da memória temporária, mas o arquivo anexo no painel acima continua acessível.', flags: [1 << 6] });
            }

            const codigo = itemCache.codigo;
            if (codigo.length <= 1900) {
                return interaction.reply({ content: `\`\`\`${itemCache.lang}\n${codigo}\n\`\`\``, flags: [1 << 6] });
            } else {
                const anexoDireto = new AttachmentBuilder(Buffer.from(codigo, 'utf-8'), { name: `codigo_completo.${obterExtensaoArquivo(itemCache.lang)}` });
                return interaction.reply({ content: '📋 **Código Completo:** Segue o arquivo completo para cópia:', files: [anexoDireto], flags: [1 << 6] });
            }
        }

        if (interaction.customId.startsWith('btn_baixar_codigo_')) {
            const idCodigo = interaction.customId.replace('btn_baixar_codigo_', '');
            const itemCache = cacheCodigosGerados.get(idCodigo);

            if (!itemCache) {
                return interaction.reply({ content: '⚠️ O código expirou da memória temporária.', flags: [1 << 6] });
            }

            const extensao = obterExtensaoArquivo(itemCache.lang);
            const anexoDireto = new AttachmentBuilder(Buffer.from(itemCache.codigo, 'utf-8'), { name: `script_${itemCache.etapa || 1}.${extensao}` });
            return interaction.reply({ content: `📥 Segue seu arquivo **.${extensao}** completo:`, files: [anexoDireto], flags: [1 << 6] });
        }

        if (interaction.customId === 'btn_abrir_menu_info') {
            await interaction.deferReply({ flags: [1 << 6] });
            const menu = gerarMenuInformativo();
            await interaction.editReply({ embeds: menu.embeds, components: menu.components });
            return;
        }

        if (interaction.customId === 'btn_voltar_painel_principal') {
            await interaction.deferUpdate();
            const painel = gerarPainelPrincipal();
            await interaction.editReply({ embeds: painel.embeds, components: painel.components });
            return;
        }

        if (interaction.customId === 'btn_iniciar_cadastro') {
            await interaction.deferReply({ flags: [1 << 6] });
            const userSnap = await getDoc(doc(db, 'usuarios', interaction.user.id));
            if (userSnap.exists()) return interaction.editReply({ content: '❌ Você já possui cadastro. Clique em **Entrar / Meu Painel**.' });
            const termos = gerarTermosLGPD();
            await interaction.editReply({ embeds: termos.embeds, components: termos.components });
        }

        if (interaction.customId === 'btn_recusar_lgpd') {
            await interaction.update({ content: '❌ Cadastro cancelado.', embeds: [], components: [] });
        }

        if (interaction.customId === 'btn_aceitar_lgpd') {
            await interaction.update({ content: '⏳ Criando sua central de desenvolvimento...', embeds: [], components: [] });

            const userRef = doc(db, 'usuarios', interaction.user.id);
            await setDoc(userRef, {
                discordId: interaction.user.id,
                nomeDiscord: interaction.user.username,
                plano: 'Grátis',
                codigosGeradosHoje: 0,
                dataUltimoUso: getDataHoje(),
                dataCadastro: new Date().toISOString()
            });

            const categoria = await obterOuCriarCategoriaIA(interaction.guild);
            const canalNome = `ia-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
            let canalPrivado = interaction.guild.channels.cache.find(c => c.name === canalNome);
            
            if (canalPrivado) {
                if (categoria && canalPrivado.parentId !== categoria.id) {
                    await canalPrivado.setParent(categoria.id, { lockPermissions: false }).catch(() => {});
                }
            } else {
                canalPrivado = await interaction.guild.channels.create({
                    name: canalNome,
                    type: ChannelType.GuildText,
                    parent: categoria ? categoria.id : undefined,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ],
                });
            }

            const boasVindas = gerarBoasVindasCanal(interaction.user.id);
            const msgFixada = await canalPrivado.send({ content: `<@${interaction.user.id}>`, embeds: boasVindas.embeds, components: boasVindas.components });
            await msgFixada.pin().catch(() => {});

            await interaction.editReply({ content: `✅ Central criada com sucesso: ${canalPrivado}` });
        }

        if (interaction.customId === 'btn_ver_planos_direto' || interaction.customId === 'btn_voltar_planos') {
            const painel = gerarPainelPlanos();
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ embeds: painel.embeds, components: painel.components, flags: [1 << 6] });
            } else {
                await interaction.update({ content: null, embeds: painel.embeds, components: painel.components });
            }
        }

        if (interaction.customId === 'btn_plano_plus_pix') {
            await interaction.update(gerarTelaPix());
        }

        if (interaction.customId === 'btn_entrar') {
            await interaction.deferReply({ flags: [1 << 6] }); 
            const userSnap = await getDoc(doc(db, 'usuarios', interaction.user.id));

            if (userSnap.exists()) {
                const userData = userSnap.data();
                const categoria = await obterOuCriarCategoriaIA(interaction.guild);
                const canalNome = `ia-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');
                let canalPrivado = interaction.guild.channels.cache.find(c => c.name === canalNome);
                
                if (canalPrivado) {
                    if (categoria && canalPrivado.parentId !== categoria.id) {
                        await canalPrivado.setParent(categoria.id, { lockPermissions: false }).catch(() => {});
                    }
                } else {
                    canalPrivado = await interaction.guild.channels.create({
                        name: canalNome,
                        type: ChannelType.GuildText,
                        parent: categoria ? categoria.id : undefined,
                        permissionOverwrites: [
                            { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
                            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                        ],
                    });

                    const boasVindas = gerarBoasVindasCanal(interaction.user.id);
                    const msgFixada = await canalPrivado.send({ embeds: boasVindas.embeds, components: boasVindas.components });
                    await msgFixada.pin().catch(() => {});
                }

                const status = verificarAssinaturaValida(userData);
                let statusTexto = status.status === 'plus' 
                    ? (status.tipo === 'vitalicio' ? '👑 Plus Vitalício' : '👑 Plus Mensal') 
                    : `🆓 Grátis (${status.codigosRestantes}/10 gerações restantes hoje)`;

                await interaction.editReply({ content: `✅ Seu status: **${statusTexto}**.\n👉 Seu canal: ${canalPrivado}` });
            } else {
                await interaction.editReply({ content: '❌ Cadastro não encontrado. Clique em **Criar Conta Grátis** no painel principal.' });
            }
        }

    } catch (erroGeral) {
        console.error("Erro na interação:", erroGeral);
    }
});

client.login(process.env.DISCORD_TOKEN);