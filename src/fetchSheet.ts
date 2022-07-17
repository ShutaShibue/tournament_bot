const spreadSheetID = "1g11mGitKFqR3AERor3BtBGsWDpJ9_hwqQ8CDNk1HCao"
const sheetName = "players"
import dotenv from 'dotenv'
dotenv.config()

const url = "https://sheets.googleapis.com/v4/spreadsheets/" + spreadSheetID + "/values/" + sheetName + "?key=" + process.env.API_key
import fetch from 'node-fetch'
export async function Fetch() {
    const Plists:Array<Array<any>> = []
    await fetch(url)
        .then(async res => {
            const n = await res.json()
            const data: Array<Array<string>> = n.values
            data.shift() //remove head
            for (let i=0; i<data.length; i++){
                const Elem = data[i]
                Plists.push(Elem)
            }         
    })
    return Plists
}