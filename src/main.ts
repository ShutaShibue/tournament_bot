import { Message, Client, DMChannel, MessageEmbed } from 'discord.js'
import dotenv from 'dotenv'
import {Fetch} from './fetchSheet'
import * as sqlite3 from 'sqlite3';
import axios from 'axios'

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
setupSQL()


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

    //運営用
    if(isAdmin(message.author.id)){
        if (message.content.startsWith('告知')) announcement(message.content.split(' ')[1])
        if (message.content.startsWith('pt追加')) adjustPoints(message)
    }
    if (message.channel.type !== "DM") return
    // in DM
    if (message.mentions.users.has(client.user!.id)) playerSystem(message)
})

client.login(process.env.TOKEN)

function playerSystem(message:Message){
    const id = message.author.id
    const ch = client.users.cache.get(id)?.dmChannel

    ch?.send(
        '何をしますか?\n1: 割り振り状況、pt残高を確認したい\n2: 投票したい\n3:新たにプレイヤー登録しました。確認してください。'
        )
    const filter = (msg:Message) => msg.author.id === id
    ch?.awaitMessages({ filter, max: 1, time: 15 * 1000 })
    .then(async collected => {
        if (!collected.size) return ch.send('タイムアウトしました')
        const sel =  collected.first()?.content
        if      (sel === "1")   await sendVotingStatus(ch, id)
        else if (sel === "2")   await vote(ch, id)
        else if (sel === "3")   await fetchPD(id).then(()=> ch.send('データベースを更新しました'))
        else if (sel === "dev") await addPointsAPI()
        else ch.send('終了します')  
    })
}

async function vote(ch:DMChannel, id:string) {

    const balance = await sendVotingStatus(ch, id)
    ch.send('投票したいキャラクターの番号を入力してください。')
    const filter = (msg:Message) => msg.author.id !== client.user?.id
    // select character
    const charIdObj = await ch.awaitMessages({ filter, max: 1, time: 20 * 1000 })
    if (!charIdObj.size) return ch.send('タイムアウトしました。投票をキャンセルします')
    const charIdNum =  Number(charIdObj.first()?.content)
    const votedChar = characters[charIdNum]
    if(!votedChar) return ch.send('不明なキャラクターIDです。投票をキャンセルします')

    ch.send(`${votedChar}に投票します。何票入れますか? (pt残高: ${balance}\n半角で入力してください。(例: 10)`)
    const voteAmtStr = await ch.awaitMessages({ filter, max: 1, time: 30 * 1000 })
    if (!voteAmtStr.size) return ch.send('タイムアウトしました。投票をキャンセルします')
    let voteRequested =  Number(voteAmtStr.first()?.content)
    db.get(
        `select ${votedChar} from pd where id = ?`,
        [id],
        (err:any, rec:any) => { 
            const votedRecord = Number(rec[votedChar])                        
            if (isNaN(voteRequested) || voteRequested < 1 ) return ch.send('無効な値です。投票をキャンセルします')
            if(balance < voteRequested) return ch.send('残高不足です。投票をキャンセルします。')
            voteRequested += Math.floor(votedRecord);
            db.run(`update pd set ${votedChar} = ?  where id = ?`, [voteRequested, id])

            const embed = new MessageEmbed()
            .setTitle("投票完了")
            .addField(votedChar, `合計${voteRequested}pt`, true)
            .addField('pt残高', `${balance-voteRequested}`, true)
            .setColor('#0000ff')
            .setTimestamp()
            ch.send({embeds: [embed] })
        }
    )
}

async function fetchPD(senderId:string){
    const senderTag = client.users.cache.get(senderId)!.tag
    const pData = await Fetch()    
    db.serialize(() => {
        for (let i = 0; i < pData.length; i++) {
            const regTag = pData[i][1]
            const name = pData[i][2]
            let regId = pData[i][4]

            if (!name) continue
            if (!regId){
                if (regTag === senderTag) regId = senderId
                else continue
            }
            db.run(`INSERT or ignore INTO pd(id, name) VALUES (?, ?)`, [regId, name]);
        }
    })
}

function setupSQL(){
    let order = `CREATE TABLE IF NOT EXISTS pd(
        id text primary key,
        name text,
        earned int not null default 0,
        adjust int not null default 0
        `
    
    for (let i = 0; i < characters.length; i++) {
        order += ', ' + characters[i] + ' int not null default 0'
    }
    order += ')'
    db.serialize(() => {
        db.run(order);
        //db.run(`INSERT OR IGNORE INTO pd(id, name) VALUES (?, ?)`, ['0', "TOTAL"]);
    })
}

async function sendVotingStatus(ch:DMChannel, id:string){
    const balance:number = await new Promise((resolve)=>{
        let msg = ''
        db.get(
            `select * from pd where id = ?`,
            [id],
            (err:any, row:any) => { 
                if (err) return ch.send('プレイヤー登録をしてください。最近した場合は、「3:新たにプレイヤー登録しました。確認してください。」を選択してください。\n終了します。')
                let ptUsed = 0                       
                for (let i = 0; i < characters.length; i++) {
                    const voted = Number(row[characters[i]])
                    const cid = i<10? i+' ' : i+''
                    msg += `ID: ${cid}    ${voted}票    ${characters[i]}\n`
                    ptUsed += voted
                }
                const balance = Number(row['earned']) + Number(row['adjust']) - ptUsed
                msg += `\nあなたのポイント残高: ${balance}\n`
                ch.send(msg)
                resolve(balance)
            }
        )
    })
    return balance
}

function adjustPoints(msg:Message){
    const executer = msg.author.id

    const player = msg.mentions.members?.first()
    if (!player) return msg.channel.send('Argument Invalid')

    const msgs = msg.content.split(' ')
    const reason = msgs[2]
    const adds = Math.floor(Number(msgs[3]))
    
    if(!adds || adds < 0) return msg.channel.send('Value Invalid')

    db.get(
        `select adjust from pd where id = ?`,
        [player.user.id], 
        (err:any, row:any) => { 
            const record = Number(row['adjust'])
            db.run(`update pd set adjust = ?  where id = ?`, [record + adds, player.user.id])

            const embed = new MessageEmbed()
            .setTitle(reason)
            .addField(player.displayName, `${adds}ポイント追加`)
            .setColor('#00ff00')
            .setTimestamp()

            embed.setFooter({
                text: '運営: ' + executer
                })
            msg.channel.send({embeds: [embed] })
        })
}

async function addPointsAPI(){
    const parsed :{ [name: string]: number } = {}
    const slope = [10, 5, 2]
    /*
    const url = 'https://sinoa.ws/janyuapp/tournament/point?tournament_id=0'
    axios.get(url, {
        headers: {
          Authorization: `Bearer ${process.env.janyuApp}`,
        }
    }).then((response) =>{
        console.log(response);
    }).catch(e=>console.log(e.response.data))
*/
    const responseSample = {
        "result": "success",
        "tournament_id": "6",
        "records": [
            {
                "first_player_name": "いちのみや",
                "first_point": 39.4,
                "second_player_name": "ぽこたいと",
                "second_point": 3.3,
                "third_player_name": "緋縅蝶",
                "third_point": -42.7,
                "fourth_player_name": null,
                "fourth_point": null,
                "tag": null,
                "paifu_link": "220605-d5432972-56e8-44f4-b4b1-4cff6aecd04e",
            }
        ]
    }
    const matches = responseSample.records

    for (let m = 0; m < matches.length; m++) {
        const pList = []
        pList.push(matches[m].first_player_name)
        pList.push(matches[m].second_player_name)
        pList.push(matches[m].third_player_name)
        for (let r = 0; r < 3; r++){
            if (!(pList[r] in parsed)) parsed[pList[r]] = 0
            parsed[pList[r]] += slope[r]
        }
    }
    Object.keys(parsed).forEach((pName:string) => {
        const pt = parsed[pName]        
        db.run(`update pd set earned = ?  where name = ?`, [pt, pName])
      });
}

function isAdmin(id:string){
    const admins = ['573448752950673408', '644665543139262484', '499204446165794819', '664793910471557120']
    if (admins.includes(id)) return true
    else return false
}
async function _total():Promise<Array<number>>{
    return await new Promise((resolve, reject) => {
        db.all(
            `select * from pd`,
            (err:any, row:any) => {
                const voted:Array<number> = new Array(characters.length).fill(0)
                let earned = 0
                if(err){
                    reject(err);
                } else {
                    for (let r = 0; r < row.length; r++) {
                        for (let c = 0; c < characters.length; c++) {
                            const tmp = row[r][characters[c]]
                            voted[c] += Number(tmp)
                        }
                        earned += Number(row[r]['earned']) + Number(row[r]['adjust'])
                    }
                    voted.push(earned)
                    resolve(voted)
                }
            }
        )
    })    
}

async function announcement(msgId:string){
    const targetCh = client.channels.cache.get('593411354069827595')
    const adminCh = client.channels.cache.get('996036283438727232')
    if (!adminCh?.isText() || !targetCh?.isText()) return
    const msg = await adminCh.messages.fetch(msgId)
    if(!msg || typeof(msg.content) !== 'string') return adminCh.send('古い/存在しない/平文以外のメッセージは送信できません')
    targetCh.send(msg.content)
}
