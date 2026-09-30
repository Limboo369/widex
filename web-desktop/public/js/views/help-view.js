/**
 * Help window.
 */
import { h } from '../util/dom.js';

function row(keys, text) {
    return h('tr', h('td', keys), h('td', text));
}

export function createHelpView() {
    return h('div.view',
        h('div.section',
            h('h3', '🎮 Kako da igraš'),
            h('ol.steps',
                h('li', 'Poveži telefon (prozor ', h('b', 'Povezivanje'), ') i klikni ', h('b', '▶ Pokreni'), '.'),
                h('li', 'Otvori igru iz menija ', h('b', '⚡ Start'), ' ili direktno na slici telefona.'),
                h('li', 'Pritisni ', h('kbd', 'F8'), ' (ili 🎮 Igra) — miš i tastatura postaju kontrole.'),
                h('li', 'Prvi put pritisni ', h('kbd', 'F9'), ', izaberi šablon (npr. Pucačina) i prevuci oznake tačno preko dugmadi u igri. Sačuvaj.'),
                h('li', 'Klikni na sliku da miš „uhvati“ kameru. ', h('kbd', '`'), ' (taster levo od 1) oslobađa kursor za menije.'))),
        h('div.section',
            h('h3', '⌨️ Prečice'),
            h('table.shortcut-table',
                row(h('kbd', 'F8'), 'Uključi/isključi režim igre'),
                row(h('kbd', 'F9'), 'Mapiranje tastera za trenutnu igru (profil se pamti po igri)'),
                row(h('kbd', 'F10'), 'App fullscreen: only the phone screen, without the Wi-Dex desktop (Esc goes to the game; hold Esc to exit)'),
                row(h('kbd', 'F11'), 'Wi-Dex fullscreen: the whole desktop, like any Windows app'),
                row(h('kbd', '`'), 'U igri: oslobodi/uhvati miš (kursor za klik po meniju)'),
                row(h('kbd', 'Esc'), 'Pusti miš (van celog ekrana) / Nazad na telefonu'),
                row('Desni klik', 'Nazad (van režima igre)'),
                row('Srednji klik', 'Početni ekran (van režima igre)'),
                row('Točkić', 'Skrolovanje (van režima igre)'),
                row([h('kbd', 'Ctrl'), '+', h('kbd', 'V')], 'Nalepi tekst sa računara u telefon'),
                row([h('kbd', 'Ctrl'), '+', h('kbd', 'C')], 'Kopiraj izabrani tekst sa telefona na računar'))),
        h('div.section',
            h('h3', '💡 Saveti za najbolji rezultat'),
            h('ul',
                h('li', 'Koristi Wi-Fi na 5 GHz (ili 6 GHz), telefon blizu rutera. Računar po mogućstvu na kablu.'),
                h('li', 'Ako slika kasni ili seče: Podešavanja → smanji protok ili rezoluciju („Brzo“).'),
                h('li', 'Uključi „Ugasi ekran telefona“ — igra radi i dalje, telefon se manje greje.'),
                h('li', 'Posle restarta telefona: ponovo uključi Bežično otklanjanje grešaka (uparivanje ne treba ponovo).'),
                h('li', 'Pažnja: neke igre ne dozvoljavaju mapiranje tastature (anti-cheat). Koristi na svoju odgovornost.'))),
        h('div.section',
            h('h3', '❓ Problemi'),
            h('ul',
                h('li', h('b', 'Telefon se ne pojavljuje: '), 'proveri da su na istoj mreži, uključi pa isključi Bežično otklanjanje grešaka, ili unesi IP i port ručno.'),
                h('li', h('b', 'Nema slike: '), 'koristi Chrome ili Edge i otvori ', h('code', 'http://localhost:3000'), ' (ne IP adresu).'),
                h('li', h('b', 'Nema zvuka: '), 'klikni bilo gde na stranici (browser traži klik pre puštanja zvuka).'),
                h('li', h('b', 'Kontrole promašuju: '), 'otvori mapiranje (F9) dok je igra otvorena i poravnaj oznake.'),
                h('li', h('b', 'Ekran telefona ostao ugašen: '), 'pritisni dugme za napajanje dva puta.'))));
}
