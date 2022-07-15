import { Message, Client, DMChannel } from 'discord.js'
import dotenv from 'dotenv'
import {Fetch} from './fetchSheet'
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
const db = new sqlite3.Database('db.sqlite3')
const tableMake = sql_table()
db.run(tableMake);

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
    if (message.content.startsWith('Man')){
        const t = message.author.tag
        db.run(`update pd set earned = 100  where tag = '${t}'`)
    }
    if (message.channel.type !== "DM") return
    if (!client.user) return
    const botID = client.user.id
    const userID = message.author.id
    const userTag = message.author.tag    
    if (message.mentions.users.has(botID)){
        const ch = client.users.cache.get(userID)?.dmChannel

        ch?.send(
            '何をしますか?\n1: 割り振り状況、pt残高を確認したい\n2: 投票したい\n3:新たにプレイヤー登録しました。確認してください。'
            )
        const filter = (msg:Message) => msg.author.id === message.author.id
        ch?.awaitMessages({ filter, max: 1, time: 10 * 1000 })
        .then(async collected => {
            if (!collected.size) return ch.send('タイムアウトしました')
            const selector =  collected.first()?.content            
            switch (selector) {
                case "1":
                    await sendVotingStatus(ch, userTag)
                    break;

                case "2":
                    await vote(ch, userTag)
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

async function vote(ch:DMChannel, tag:string) {

    const balance = await sendVotingStatus(ch, tag)
    ch.send('投票したいキャラクターの番号を入力してください。')
    const filter = (msg:Message) => msg.author.id !== client.user?.id

    // select character
    ch.awaitMessages({ filter, max: 1, time: 20 * 1000 })
    .then(async collected => {
        if (!collected.size) return ch.send('タイムアウトしました。投票をキャンセルします')
        const charID =  Number(collected.first()?.content)
        const votedChar = characters[charID]

        ch.send(`${votedChar}に投票します。何票入れますか?\n半角で入力してください。(例:10)\n自然数以外を入力すると投票がキャンセルされます。`)
        ch.awaitMessages({ filter, max: 1, time: 30 * 1000 })
            .then(async collected => {
                if (!collected.size) return ch.send('タイムアウトしました。投票をキャンセルします')
                let desiredVoteAmt =  Number(collected.first()?.content)
                db.serialize(() => {
                    db.get(`select ${votedChar} from pd where tag = '${tag}'`, (err:any, row:any) => { 
                        const votedRecord = Number(row[votedChar])                        
                        if (isNaN(desiredVoteAmt) || desiredVoteAmt < 1 ) return ch.send('無効な値です。投票をキャンセルします')
                        if(balance < desiredVoteAmt) return ch.send('残高不足です。投票をキャンセルします。')
                        desiredVoteAmt += Math.floor(votedRecord);
                        db.run(`update pd set ${votedChar} = ${desiredVoteAmt}  where tag = '${tag}'`)
                        ch.send(`${votedChar}に${desiredVoteAmt}票入れました。投票を終了します。`)
                    })
                })
            })
    })
} 
async function updatePlayerinDB(){
    const pData = await Fetch()    
    db.serialize(() => {
        for (let i = 0; i < pData.length; i++) {
            const tag = pData[i][0]
            const name = pData[i][1]
            db.run(`INSERT or ignore INTO pd(tag, name) VALUES (?, ?)`, [tag, name]);
        }
    })
}


function sql_table(){
    let order = `CREATE TABLE IF NOT EXISTS pd(
        tag text primary key,
        name text,
        earned int not null default 0,
        adjust int not null default 0
        `
    
    for (let i = 0; i < characters.length; i++) {
        order += ', ' + characters[i] + ' int not null default 0'
    }
    order += ')'

    return order
}
async function sendVotingStatus(ch:DMChannel, tag:string){
    const balance:number = await new Promise((resolve)=>{
        let msg = ''
        db.get(`select * from pd where tag = '${tag}'`, (err:any, row:any) => { 
            if (err) return ch.send('プレイヤー登録をしてください。最近した場合は、「3:新たにプレイヤー登録しました。確認してください。」を選択してください。\n終了します。')
            let ptUsed = 0                       
            for (let i = 0; i < characters.length; i++) {
                const voted = Number(row[characters[i]])
                const id = i<10? i+' ' : i+''
                msg += `ID: ${id}    ${voted}票    ${characters[i]}\n`
                ptUsed += voted
            }
            const balance = Number(row['earned']) - ptUsed
            msg += `\nあなたのポイント残高: ${balance}\n`
            ch.send(msg)
            resolve(balance)
        })
    })
    return balance
}

function isAdmin(tag:string){
    const admins = ['えびてん#8658', 'poko#3397', 'konaso#1033', 'ぴにぷ#7148']
    if (admins.includes(tag)) return true
    else return false
}