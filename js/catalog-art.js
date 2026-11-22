/* Semantic, self-contained illustrations for the service catalogue. */
(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);

  const scenes = {
    corporate: `
      <rect x="26" y="34" width="308" height="126" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <path d="M40 47h30M82 47h20M114 47h20M290 47h27" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="40" y="61" width="150" height="82" rx="3" fill="#151c29"/>
      <path d="M53 80h92M53 91h65" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".78"/>
      <path d="M53 104h76" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="53" y="117" width="45" height="15" rx="2" fill="var(--accent)" opacity=".95"/>
      <rect x="202" y="61" width="117" height="82" rx="3" fill="#182231"/>
      <path d="M215 126V96l19-15 20 15v30M220 126v-18h28v18M257 126V87l18-14 30 14v39M263 126v-17h24v17" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round" opacity=".9"/>
      <path d="M40 151h78M126 151h39M202 151h48M259 151h60" stroke="#8a93a8" stroke-width="2" stroke-linecap="round" opacity=".6"/>`,
    landing: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <path d="M40 47h41M277 47h42" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <path d="M48 73h139M48 84h105" stroke="#f4efe6" stroke-width="4" stroke-linecap="round" opacity=".85"/>
      <path d="M48 96h108" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="48" y="108" width="66" height="20" rx="3" fill="var(--accent)"/>
      <path d="M60 118h39" stroke="#10131b" stroke-width="2" stroke-linecap="round"/>
      <circle cx="265" cy="99" r="39" fill="var(--accent)" opacity=".13"/>
      <rect x="228" y="63" width="71" height="72" rx="7" fill="#20283a" stroke="#ffffff20"/>
      <path d="M241 113c8-24 17-37 28-37 8 0 13 10 17 27" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="269" cy="79" r="5" fill="#f4efe6" opacity=".86"/>
      <path d="M48 145h254" stroke="#ffffff19"/>
      <circle cx="77" cy="153" r="3" fill="var(--accent)"/><circle cx="91" cy="153" r="3" fill="#8a93a8"/><circle cx="105" cy="153" r="3" fill="#8a93a8"/>`,
    portfolio: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <path d="M42 48h45M276 48h42" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="43" y="60" width="81" height="84" rx="3" fill="#26313a"/>
      <path d="M43 117l25-28 15 16 16-22 25 31v30H43z" fill="var(--accent)" opacity=".7"/>
      <circle cx="98" cy="78" r="9" fill="#f4efe6" opacity=".72"/>
      <rect x="132" y="60" width="82" height="38" rx="3" fill="#282437"/>
      <path d="M132 89l20-18 19 11 16-15 27 16v15h-82z" fill="#b69199" opacity=".72"/>
      <rect x="222" y="60" width="95" height="84" rx="3" fill="#182a2b"/>
      <circle cx="269" cy="94" r="22" fill="none" stroke="var(--accent)" stroke-width="2"/>
      <path d="M252 104l13-20 19 23" fill="none" stroke="#f4efe6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="132" y="105" width="82" height="39" rx="3" fill="#232b3b"/>
      <path d="M144 119h55M144 128h36" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>`,
    hospitality: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="42" y="52" width="122" height="91" rx="4" fill="#2b2520"/>
      <path d="M42 112q30-33 61-9t61-9v49H42z" fill="var(--accent)" opacity=".55"/>
      <circle cx="103" cy="94" r="25" fill="#e7ddc8" opacity=".92"/><circle cx="103" cy="94" r="17" fill="#72806a"/><circle cx="96" cy="89" r="4" fill="#c96f4a"/><circle cx="110" cy="99" r="5" fill="#c96f4a"/>
      <path d="M181 62h128M181 74h88" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".72"/>
      <path d="M181 91h111M181 101h95" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="181" y="116" width="88" height="20" rx="3" fill="var(--accent)"/><path d="M195 126h60" stroke="#10131b" stroke-width="2" stroke-linecap="round"/>`,
    nonprofit: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <circle cx="101" cy="95" r="42" fill="var(--accent)" opacity=".13"/>
      <path d="M101 122c-8-8-31-24-31-40 0-15 19-19 31-5 12-14 31-10 31 5 0 16-23 32-31 40z" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round"/>
      <path d="M101 112v-23m0 12c-10-10-16-11-20-11m20 4c8-10 14-12 20-12" fill="none" stroke="#f4efe6" stroke-width="2" stroke-linecap="round"/>
      <path d="M169 66h139M169 78h92" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <path d="M169 95h126M169 105h101" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="169" y="121" width="89" height="18" rx="3" fill="var(--accent)"/><path d="M181 130h62" stroke="#10131b" stroke-width="2" stroke-linecap="round"/>`,
    education: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <path d="M48 129V84l55-31 55 31v45M60 128V89h86v39M80 128v-26h18v26M116 128v-26h18v26" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M48 130h111" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".7"/>
      <path d="M184 64h126M184 76h92" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".75"/>
      <path d="M184 94h119M184 104h98" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="184" y="120" width="51" height="22" rx="3" fill="#20283a"/><path d="M196 124l13 7-13 7z" fill="var(--accent)"/>
      <rect x="243" y="120" width="67" height="22" rx="3" fill="#20283a"/><path d="M253 131h46" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>`,
    civic: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <path d="M45 73l58-26 58 26H45zM51 132h104M58 79v48M80 79v48M103 79v48M126 79v48M149 79v48" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M177 62h131M177 74h91" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".74"/>
      <path d="M177 93h127M177 103h104" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="177" y="119" width="130" height="24" rx="3" fill="#182231" stroke="#ffffff16"/><circle cx="190" cy="131" r="4" fill="var(--accent)"/><path d="M201 131h93" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>`,
    poster: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#11131d" stroke="#ffffff18"/>
      <rect x="46" y="47" width="85" height="102" rx="3" fill="#27243a"/>
      <circle cx="89" cy="88" r="28" fill="var(--accent)" opacity=".75"/><path d="M61 119l26-34 17 20 17-19 10 11v34H61z" fill="#10131b" opacity=".75"/>
      <path d="M154 65h150M154 77h111" stroke="#f4efe6" stroke-width="4" stroke-linecap="round" opacity=".8"/>
      <path d="M154 94h121M154 104h104" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="154" y="121" width="66" height="18" rx="3" fill="var(--accent)"/><path d="M233 130h70" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>`,
    magazine: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="42" y="50" width="112" height="91" rx="3" fill="#29333a"/><path d="M42 115l31-38 20 24 21-18 40 35v23H42z" fill="var(--accent)" opacity=".72"/><circle cx="124" cy="69" r="9" fill="#f4efe6" opacity=".8"/>
      <path d="M169 58h144M169 70h126" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".78"/>
      <path d="M169 88h134M169 98h120M169 112h129M169 122h108M169 136h133" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>`,
    docs: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="43" y="49" width="62" height="98" rx="3" fill="#171e2a"/><circle cx="55" cy="63" r="3" fill="var(--accent)"/><path d="M64 63h28M52 78h40M52 89h34M52 100h41M52 111h28" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <path d="M126 58h162M126 70h132M126 87h151M126 98h141M126 109h155M126 120h97" stroke="#f4efe6" stroke-width="2.5" stroke-linecap="round" opacity=".68"/>
      <rect x="126" y="132" width="58" height="5" rx="2" fill="var(--accent)"/>`,
    storefront: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <path d="M47 72l9-22h78l9 22" fill="#242b38" stroke="var(--accent)" stroke-width="2"/><path d="M48 72h96v9a9 9 0 0 1-9 9 9 9 0 0 1-9-9 9 9 0 0 1-18 0 9 9 0 0 1-18 0 9 9 0 0 1-18 0 9 9 0 0 1-18 0z" fill="var(--accent)" opacity=".8"/>
      <rect x="57" y="93" width="79" height="44" rx="2" fill="#1c2532"/><path d="M69 127l17-22 15 15 12-13 17 20" fill="none" stroke="#f4efe6" stroke-width="2"/>
      <rect x="172" y="58" width="138" height="14" rx="3" fill="#20283a"/><path d="M184 65h82" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="172" y="83" width="60" height="55" rx="3" fill="#20283a"/><rect x="241" y="83" width="69" height="55" rx="3" fill="#20283a"/><path d="M183 124l17-25 19 24M251 122l16-20 31 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`,
    product: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="46" y="48" width="122" height="100" rx="4" fill="#192230"/>
      <path d="M87 68l13-8 14 8 12 12-9 8-4-4v39H82V84l-4 4-9-8z" fill="var(--accent)" opacity=".82" stroke="#f4efe6" stroke-width="1.4" stroke-linejoin="round"/>
      <path d="M101 61l-4 12 9 7 9-7-5-12" fill="none" stroke="#f4efe6" stroke-width="1.4"/>
      <path d="M190 61h120M190 73h84" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".78"/>
      <path d="M190 93h98M190 103h111" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <circle cx="198" cy="127" r="5" fill="var(--accent)"/><circle cx="214" cy="127" r="5" fill="#8a93a8"/><circle cx="230" cy="127" r="5" fill="#b69199"/>
      <rect x="253" y="117" width="57" height="20" rx="3" fill="var(--accent)"/>`,
    digital: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="48" y="54" width="92" height="82" rx="5" fill="#192433" stroke="#ffffff18"/>
      <path d="M75 73h38v48H75z" fill="#202c3d" stroke="var(--accent)" stroke-width="2"/><path d="M82 82h24M82 91h24M82 100h18" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/><path d="M94 106v19m-9-8 9 9 9-9" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M168 64h143M168 76h100" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".75"/><path d="M168 95h127M168 105h111" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="168" y="121" width="88" height="18" rx="3" fill="var(--accent)"/><path d="M184 130h56" stroke="#10131b" stroke-width="2" stroke-linecap="round"/>`,
    marketplace: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <path d="M45 65l8-15h54l8 15" fill="var(--accent)" opacity=".7"/><path d="M45 65h70v8a7 7 0 0 1-7 7 7 7 0 0 1-7-7 7 7 0 0 1-14 0 7 7 0 0 1-14 0 7 7 0 0 1-14 0 7 7 0 0 1-14 0z" fill="#c9a96e"/>
      <path d="M144 65l8-15h54l8 15" fill="#6f8f8d" opacity=".8"/><path d="M144 65h70v8a7 7 0 0 1-7 7 7 7 0 0 1-7-7 7 7 0 0 1-14 0 7 7 0 0 1-14 0 7 7 0 0 1-14 0 7 7 0 0 1-14 0z" fill="#6f8f8d"/>
      <path d="M243 65l8-15h54l8 15" fill="#b69199"/><path d="M243 65h70v8a7 7 0 0 1-7 7 7 7 0 0 1-7-7 7 7 0 0 1-14 0 7 7 0 0 1-14 0 7 7 0 0 1-14 0 7 7 0 0 1-14 0z" fill="#b69199"/>
      <rect x="48" y="91" width="62" height="46" rx="2" fill="#20283a"/><rect x="146" y="91" width="62" height="46" rx="2" fill="#20283a"/><rect x="245" y="91" width="62" height="46" rx="2" fill="#20283a"/><path d="M58 125l18-22 24 26M156 126l15-17 26 25M255 123l18-18 24 29" fill="none" stroke="#f4efe6" stroke-width="2"/>`,
    calendar: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="45" y="48" width="143" height="100" rx="4" fill="#151c29" stroke="#ffffff19"/><path d="M45 70h143" stroke="#ffffff19"/><path d="M61 58v-9M171 58v-9" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
      <path d="M64 84h9m14 0h9m14 0h9m14 0h9m14 0h9M64 101h9m14 0h9m14 0h9m14 0h9m14 0h9M64 119h9m14 0h9m14 0h9m14 0h9m14 0h9" stroke="#8a93a8" stroke-width="5" stroke-linecap="round"/>
      <circle cx="101.5" cy="101" r="8" fill="var(--accent)"/><circle cx="146.5" cy="119" r="8" fill="#263d3b" stroke="#7ba99b" stroke-width="1.5"/>
      <path d="M214 60h92M214 72h62" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".75"/><rect x="214" y="88" width="93" height="22" rx="3" fill="#20283a"/><circle cx="227" cy="99" r="4" fill="var(--accent)"/><path d="M239 99h56" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/><rect x="214" y="118" width="93" height="22" rx="3" fill="var(--accent)"/>`,
    event: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="47" y="49" width="91" height="98" rx="4" fill="#272238"/><path d="M47 119q28-30 45-11t46-20v59H47z" fill="var(--accent)" opacity=".8"/><circle cx="111" cy="70" r="9" fill="#f4efe6" opacity=".78"/>
      <path d="M160 64h147M160 76h108" stroke="#f4efe6" stroke-width="3.5" stroke-linecap="round" opacity=".8"/><path d="M160 96h130M160 106h101" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="160" y="122" width="55" height="20" rx="3" fill="var(--accent)"/><path d="M230 132h76" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/><circle cx="303" cy="132" r="7" fill="#20283a" stroke="#8a93a8"/>`,
    dashboard: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="40" y="48" width="49" height="100" rx="3" fill="#151c29"/><circle cx="54" cy="62" r="4" fill="var(--accent)"/><path d="M51 77h27M51 89h27M51 101h27M51 113h20M51 125h27" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="101" y="48" width="98" height="42" rx="3" fill="#1a2230"/><path d="M113 76V68h12v8M132 76V60h12v16M151 76V55h12v21M170 76V64h12v12" fill="var(--accent)" opacity=".82"/>
      <rect x="208" y="48" width="111" height="42" rx="3" fill="#1a2230"/><path d="M220 76c14-20 23 5 37-7s19-13 29-11 16-9 22-10" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/><path d="M220 80h88" stroke="#ffffff18"/>
      <rect x="101" y="99" width="218" height="49" rx="3" fill="#151c29"/><path d="M114 111h68M202 111h54M271 111h34M114 123h71M202 123h75M114 136h42M202 136h43" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/><circle cx="294" cy="123" r="4" fill="var(--accent)"/>`,
    table: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <path d="M44 55h272M44 74h272M44 93h272M44 112h272M44 131h272" stroke="#ffffff16"/>
      <path d="M91 48v90M174 48v90M247 48v90" stroke="#ffffff13"/>
      <rect x="48" y="60" width="26" height="7" rx="2" fill="var(--accent)"/><path d="M102 63h54M184 63h45M258 63h43" stroke="#f4efe6" stroke-width="2" stroke-linecap="round" opacity=".65"/>
      <circle cx="60" cy="83" r="5" fill="#6f9d8a"/><path d="M102 83h58M184 83h39M258 83h50" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <circle cx="60" cy="102" r="5" fill="#b69199"/><path d="M102 102h47M184 102h47M258 102h38" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <circle cx="60" cy="121" r="5" fill="var(--accent)"/><path d="M102 121h57M184 121h44M258 121h51" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>`,
    map: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#111a21" stroke="#ffffff18"/>
      <path d="M36 64l43-13 42 9 43-13 41 14 47-11 42 13v83l-43-14-46 12-44-11-43 14-43-11-39 12z" fill="#1a2a2d" stroke="#ffffff15" stroke-width="1.4"/>
      <path d="M38 91l54-14 38 18 47-24 44 21 40-13 40 16M50 133l41-31 49 19 34-23 41 24 47-27 25 4" fill="none" stroke="#526e6c" stroke-width="3" stroke-linecap="round"/>
      <path d="M93 80c0-8 6-14 14-14s14 6 14 14c0 11-14 25-14 25S93 91 93 80z" fill="var(--accent)"/><circle cx="107" cy="80" r="4" fill="#10131b"/>
      <path d="M214 113c0-7 5-12 12-12s12 5 12 12c0 10-12 22-12 22s-12-12-12-22z" fill="#e5a77e"/><circle cx="226" cy="113" r="3.5" fill="#10131b"/>
      <circle cx="170" cy="91" r="4" fill="#f4efe6"/><path d="M119 86q25-11 48 5t47 14" fill="none" stroke="#f4efe6" stroke-width="2" stroke-dasharray="4 4"/>`,
    form: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="48" y="48" width="78" height="101" rx="4" fill="#171f2c"/><path d="M66 48v-6h43v6" fill="none" stroke="#8a93a8" stroke-width="2"/>
      <path d="M63 68h46M63 79h46M63 90h33M63 105h46M63 116h35" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <path d="M63 135c16-17 24 7 46-10" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M151 61h157M151 73h112" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".76"/>
      <rect x="151" y="90" width="157" height="25" rx="3" fill="#1b2432"/><path d="M163 102h87" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/><circle cx="294" cy="102" r="6" fill="var(--accent)"/>
      <rect x="151" y="124" width="84" height="18" rx="3" fill="var(--accent)"/>`,
    media: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="43" y="48" width="159" height="100" rx="4" fill="#202536"/>
      <path d="M43 122l33-36 23 22 26-30 41 47 36 23H43z" fill="var(--accent)" opacity=".7"/><circle cx="161" cy="68" r="10" fill="#f4efe6" opacity=".72"/>
      <circle cx="123" cy="99" r="19" fill="#0d111b" opacity=".68"/><path d="M119 88l16 11-16 11z" fill="#f4efe6"/>
      <path d="M216 62h96M216 74h71" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".76"/><path d="M216 94h91M216 104h85" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <path d="M217 128h91" stroke="#ffffff25" stroke-width="3" stroke-linecap="round"/><path d="M217 128h48" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="265" cy="128" r="4" fill="#f4efe6"/>`,
    chat: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="46" y="50" width="133" height="35" rx="10" fill="#20283a"/><path d="M62 63h88M62 73h58" stroke="#c1c7d2" stroke-width="2" stroke-linecap="round"/>
      <rect x="180" y="92" width="131" height="35" rx="10" fill="#263c3b"/><path d="M195 105h90M195 115h65" stroke="#e4e9e2" stroke-width="2" stroke-linecap="round"/>
      <circle cx="57" cy="104" r="5" fill="var(--accent)"/><circle cx="73" cy="104" r="5" fill="#8a93a8"/><circle cx="89" cy="104" r="5" fill="#8a93a8"/>
      <rect x="46" y="132" width="265" height="17" rx="8" fill="#171f2c" stroke="#ffffff17"/><circle cx="297" cy="140.5" r="5" fill="var(--accent)"/>`,
    mobile: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <rect x="69" y="42" width="82" height="112" rx="12" fill="#080b12" stroke="#8a93a8" stroke-width="2"/><rect x="76" y="53" width="68" height="88" rx="5" fill="#182231"/>
      <rect x="83" y="61" width="54" height="29" rx="3" fill="var(--accent)" opacity=".8"/><path d="M83 99h54M83 107h40M83 118h54M83 126h31" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/><circle cx="110" cy="147" r="2" fill="#8a93a8"/>
      <path d="M179 65h130M179 77h88" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".76"/><path d="M179 100h124M179 111h103" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <circle cx="189" cy="135" r="8" fill="#263c3b"/><circle cx="215" cy="135" r="8" fill="#2d293f"/><circle cx="241" cy="135" r="8" fill="#41302c"/>`,
    object: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <circle cx="112" cy="100" r="51" fill="var(--accent)" opacity=".08"/>
      <path d="M69 118l42-68 42 68z" fill="#283345" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/><path d="M111 50v68M69 118h84M111 50l42 68M111 50L69 118" fill="none" stroke="#f4efe6" stroke-width="1.4" opacity=".72"/>
      <path d="M185 61h125M185 73h94" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".76"/><path d="M185 94h116M185 104h105" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <rect x="185" y="122" width="23" height="19" rx="3" fill="#283345" stroke="var(--accent)"/><rect x="216" y="122" width="23" height="19" rx="3" fill="#283345" stroke="#8a93a8"/><rect x="247" y="122" width="23" height="19" rx="3" fill="#283345" stroke="#b69199"/>`,
    data: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#0d111b" stroke="#ffffff18"/>
      <circle cx="110" cy="97" r="39" fill="none" stroke="#263345" stroke-width="16"/><path d="M110 58a39 39 0 0 1 37 53" fill="none" stroke="var(--accent)" stroke-width="16" stroke-linecap="round"/><path d="M147 111a39 39 0 0 1-61 15" fill="none" stroke="#83a89b" stroke-width="16" stroke-linecap="round"/>
      <circle cx="110" cy="97" r="4" fill="#f4efe6"/><path d="M179 62h131M179 74h88" stroke="#f4efe6" stroke-width="3" stroke-linecap="round" opacity=".76"/><path d="M179 98h122M179 108h107" stroke="#8a93a8" stroke-width="2" stroke-linecap="round"/>
      <path d="M181 137h119" stroke="#ffffff22" stroke-width="2"/><circle cx="191" cy="137" r="4" fill="var(--accent)"/><circle cx="228" cy="137" r="4" fill="#83a89b"/><circle cx="265" cy="137" r="4" fill="#b69199"/>`,
    tour: `
      <rect x="27" y="34" width="306" height="128" rx="4" fill="#111a21" stroke="#ffffff18"/>
      <rect x="43" y="48" width="274" height="99" rx="4" fill="#1b2a2c"/><path d="M43 117l39-42 39 22 38-34 52 40 37-31 69 41v34H43z" fill="#53756d" opacity=".8"/><path d="M43 128l53-25 47 29 58-34 58 25 58-18v42H43z" fill="#293b37"/>
      <circle cx="269" cy="70" r="12" fill="var(--accent)" opacity=".9"/><circle cx="269" cy="70" r="20" fill="none" stroke="var(--accent)" opacity=".35"/><path d="M58 62h52" stroke="#f4efe6" stroke-width="2" stroke-linecap="round" opacity=".8"/><circle cx="303" cy="132" r="7" fill="#0d111b" stroke="#f4efe6"/><path d="M301 128l5 4-5 4z" fill="#f4efe6"/>`
  };

  const sceneBySlug = {
    'corporate':'corporate','landing-page':'landing','portfolio':'portfolio','hospitality-site':'hospitality',
    'events':'event','nonprofit':'nonprofit','education-showcase':'education','institutional':'civic','microsite':'poster',
    'content-media':'magazine','docs-knowledge':'docs','online-store':'storefront','digital-store':'digital',
    'subscriptions':'digital','marketplace':'marketplace','b2b-wholesale':'table','dropshipping-pod':'product',
    'auctions-rentals':'event','catalog-orders':'storefront','configurator-store':'object','appointments':'calendar',
    'stays':'hospitality','table-booking':'calendar','ticketing':'event','rentals':'calendar','on-demand':'map','travel':'tour',
    'saas':'dashboard','crm':'table','erp':'dashboard','hr':'table','project-management':'table','accounting':'dashboard',
    'logistics':'map','pos':'storefront','property-mgmt':'table','support-desk':'chat','documents-esign':'form','portals':'dashboard',
    'education-lms':'media','healthcare':'dashboard','fintech':'dashboard','real-estate':'map','automotive':'object',
    'hospitality-systems':'table','industry-iot':'dashboard','legal':'form','government':'civic','media-streaming':'media',
    'recruitment':'table','community':'chat','sports-fitness':'calendar','games':'object','emerging-tech':'object',
    'ai-data-platform':'data','chatbots':'chat','automation':'dashboard','bi':'data','internal-tools':'table',
    'recording-studio':'media','interactive-studio':'object','configurator-3d':'object','virtual-showroom':'tour','ar':'mobile',
    'launch-campaign':'poster','digital-twin':'map','virtual-events':'event','interactive-identity':'portfolio','mobile-apps':'mobile',
    'integrations':'docs','admin-cms':'dashboard','multi-region':'map','migration':'docs','redesign':'portfolio',
    'maintenance':'dashboard','audit':'data','training':'media'
  };

  const palette = ['#c9a96e','#8db5a6','#b99bab','#91a8c8','#d18e72','#a79bd0'];
  function accentFor(slug) {
    let seed = 0;
    for (const char of slug) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    return palette[seed % palette.length];
  }

  function render(type, label) {
    const slug = String(type?.slug || 'service');
    const featured = {
      corporate: 'images/catalog-corporate.webp',
      'landing-page': 'images/catalog-landing.webp',
      portfolio: 'images/catalog-portfolio.webp'
    }[slug];
    if (featured) return `<img class="catalog-art-img" src="${featured}" alt="" loading="lazy" decoding="async" width="1200" height="800" aria-hidden="true">`;
    const scene = scenes[sceneBySlug[slug]] || scenes.dashboard;
    const accent = accentFor(slug);
    const id = `art-${slug.replace(/[^a-z0-9_-]/gi, '-')}`;
    return `<svg viewBox="0 0 360 180" role="img" aria-label="${escape(label)}: ${escape(type?.name)}" xmlns="http://www.w3.org/2000/svg" style="--accent:${accent}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#151b28"/><stop offset="1" stop-color="#090c13"/></linearGradient><radialGradient id="${id}-glow"><stop offset="0" stop-color="${accent}" stop-opacity=".18"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient></defs>
      <rect width="360" height="180" fill="url(#${id})"/><ellipse cx="290" cy="45" rx="100" ry="70" fill="url(#${id}-glow)"/>
      <rect x="0" y="0" width="360" height="18" fill="#07090eee"/><circle cx="12" cy="9" r="2.5" fill="#c9a96e"/><circle cx="21" cy="9" r="2.5" fill="#8a93a8"/><circle cx="30" cy="9" r="2.5" fill="#8a93a8" opacity=".55"/>
      ${scene}
    </svg>`;
  }

  window.CatalogArt = { render };
})();
