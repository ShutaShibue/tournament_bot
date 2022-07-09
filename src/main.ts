import { Message, Client, DMChannel } from 'discord.js'
import dotenv from 'dotenv'
import {Fetch} from './fetchSheet'
import * as fs from 'fs'
import * as sqlite3 from 'sqlite3';
const characters = [
    '一姫', '二階堂美樹', '軽庫娘', '藤田佳奈', '三上千織', '相原舞', '撫子', '八木唯',
    '九条璃雨', 'ジニア', 'カーヴィ', 'サラ', '二之宮花', '白石奈々', '小鳥遊雛田', 
    '五十嵐陽菜', '涼宮杏樹', '北見紗和子', '雛桃', 'かぐや姫', '藤本キララ', 'エリサ', 
    '寺崎千穂理', '福姫', '七海礼奈', '姫川響', '森川綾子', '小野寺七羽', 'ゆず', 
    '四宮夏生', 'ワン次郎', '一ノ瀬空', '明智英樹', 'ジョセフ', '斎藤治', 'エイン', 
    '月見山', '如月蓮', '石原碓海', '七夕', 'A37', 'ライアン', '滝川夏彦', 'サミール',
    'ゼクス', '西園寺一羽', '宮永咲', '宮永照', '原村和', '天江衣', 
    '蛇喰夢子', '早乙女芽亜里', '生志摩妄', '桃喰綺羅莉', '赤木しげる', '鷲巣巌',
    '四宮かぐや', '白銀御行', '早坂愛', '白銀圭']

dotenv.config()

// database init
const db = new sqlite3.Database('db.sqlite3');
    const tableMake = sql_table()

// discord client init
const client = new Client({
    intents: ['GUILDS', 'GUILD_MEMBERS', 'GUILD_MESSAGES', 'DIRECT_MESSAGES', 'DIRECT_MESSAGE_REACTIONS'],
    partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
})

client.once('ready', () => {
    console.log('Ready!')
    console.log(client.user?.tag)
    client.user?.setActivity(
        `開発中`,
    )
})

client.on('messageCreate', async (message: Message) => {
    if (message.author.bot) return
    if (message.channel.type !== "DM") return
    if (!client.user) return
    const botID = client.user.id
    const userID = message.author.id
    if (message.mentions.users.has(botID)){
        const ch = client.users.cache.get(userID)?.dmChannel

        ch?.send(
            '何をしますか?\n1: 割り振り状況、pt残高を確認したい\n2: 投票、修正がしたい\n3:新たにプレイヤー登録しました。確認してください。'
            )
        const filter = (msg:Message) => msg.author.id === message.author.id
        ch?.awaitMessages({ filter, max: 1, time: 10 * 1000 })
        .then(async collected => {
            if (!collected.size) return ch.send('タイムアウトしました')
            const selector =  collected.first()?.content            
            switch (selector) {
                case "1":
                    await checkStatus(ch)
                    break;

                case "2":
                    await vote(ch)
                    break;

                case "3":
                    await updatePlayerinDB()
                    ch.send('データベースを更新しました。')
                    break;
                default:
                    ch.send('終了します')
                    break;
            }

        })
    }
    
})

client.login(process.env.TOKEN)

async function checkStatus(channel:DMChannel) {
    console.log("hi");
    
    channel.send("投票状況/個人")
}
async function vote(channel:DMChannel) {

    channel.send(voting_Msg())
    const filter = (msg:Message) => msg.author.id !== client.user?.id

    // select character
    channel.awaitMessages({ filter, max: 1, time: 20 * 1000 })
    .then(async collected => {
        if (!collected.size) return channel.send('タイムアウトしました')
        const charID =  Number(collected.first()?.content)
        const tag = collected.first()?.author.tag
        const votedChar = characters[charID]

        channel.send('何票入れますか?  pt残高:')//残高を計算する処理を追加する
        channel.awaitMessages({ filter, max: 1, time: 20 * 1000 })
            .then(async collected => {
                if (!collected.size) return channel.send('タイムアウトしました')
                let amount =  Number(collected.first()?.content)
                db.serialize(() => {
                    db.get(`select ${votedChar} from playerdata where tag = '${tag}'`, (err:any, row:any) => {                        
                        amount += Number(row[votedChar]);
                        //マイナスの処理を追加しておく
                        db.run(`update playerData set ${votedChar} = ${amount}  where tag = '${tag}'`)
                    })
                })
            })
    })
} 
async function updatePlayerinDB(){
    const pData = await Fetch()    
    db.serialize(() => {
        db.run(tableMake);
        for (let i = 0; i < pData.length; i++) {
            const tag = pData[i][0]
            const name = pData[i][1]
            db.run(`INSERT or ignore INTO playerData(tag, name) VALUES (?, ?)`, [tag, name]);
        }
    })
}

function sql_table(){
    let order = `CREATE TABLE IF NOT EXISTS playerData(
        tag text primary key,
        name text,
        earned id not null default 0 `
    
    for (let i = 0; i < characters.length; i++) {
        order += ', ' + characters[i] + ' int not null default 0'
    }
    order += ')'

    return order
}
function voting_Msg(){
    let msg = `投票したいキャラクターの番号を指定してください。\n`
    for (let i = 0; i < characters.length; i++) {
        const id = i<10? i+' ' : i+''
        msg += `ID: ${id}      ${characters[i]}\n`   
    }
    return msg
}
