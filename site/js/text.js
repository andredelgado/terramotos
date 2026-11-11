// Every piece of interface text, in English and Portuguese.
        // same earthquake: this close in time and place
export const I18N = {
  en: {
    loc: 'en-GB', other: 'PT', aLang: 'Mudar para português',
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    r0: 'Mainland', r1: 'Azores', r2: 'Madeira', unit: ' earthquakes',
    s1d: 'Day', s1w: 'Week', s1mo: 'Month', s1y: 'Year', mag: 'Magnitude', region: 'Region', regionShort: 'Area',
    jump: 'Jump to…', jumpShort: 'Jump…', latest: 'Latest', largest: 'Largest earthquakes', decades: 'Decades', decade: (d) => `${d}s`,
    first: 'First earthquake on record', data: 'Data:', utc: 'Times in UTC',
    aSpans: 'Time per line', aMag: 'Minimum magnitude', aJump: 'Jump to', aTheme: 'Switch between light and dark',
    aDrum: 'Seismograph drum. Each line is a slice of time, newest on top; the waves are earthquakes. Scroll down to go back in time; left and right arrows step between earthquakes.',
    about: 'About',
    aboutHTML: (y) => `<h2 id="aboutTitle">Terramotos Portugal</h2>
      <p>Every earthquake recorded in mainland Portugal, the Azores and Madeira since ${y}, drawn as a seismograph drum.</p>
      <ul>
        <li>The newest line is on top. Each line covers the time you choose, from 3 hours to a year, and reads left to right. The red dot is now.</li>
        <li>Each wave is a generated illustration of one earthquake’s magnitude: taller and longer means stronger. Faded waves and hollow map dots have no magnitude on record.</li>
        <li>Switch to the list to read individual earthquakes. Click an earthquake for its details, a map and a link to share. With the keyboard, use ← / → on the drum or ↑ / ↓ in the list to step between earthquakes.</li>
        <li>Before the 1960s only large earthquakes were recorded, so older lines look quiet. With a year per line, earthquakes below magnitude 3 are drawn as a low grey profile and those of magnitude 5 or more carry their magnitude.</li>
        <li>The map uses fixed frames for the mainland, Azores and Madeira, each with its own scale. Outer circles are symbolic magnitude markers; reported felt intensity appears in the details. Choose a period or carry the visible period across from the drum or list. Shared map links preserve exact UTC dates. Zoom with the + and − buttons, a pinch or Ctrl + scroll, then drag to move. The buttons under the maps show or hide plate boundaries, active faults and volcanoes, and can colour the earthquakes by depth or by age. The play button runs the chosen period through time, from a day to the whole record.</li>
        <li>Statistics counts the earthquakes that match your filters, and Stories tells four of them.</li>
        <li>Magnitudes are on mixed scales (ML, mb, Ms, Mw). IPMA's magnitude is used wherever IPMA reported one.</li>
      </ul>
      <p class="fine">Data from IPMA, the ISC Bulletin, EMSC and USGS. New earthquakes arrive live from EMSC and are preliminary until the catalogues confirm them. Map outlines from Natural Earth; plate boundaries from Bird (2003), as converted by Hugo Ahlenius, Nordpil; active faults from the GEM Global Active Faults Database (CC BY-SA 4.0); volcanoes from the Smithsonian Global Volcanism Program; town locations from GeoNames (CC BY 4.0).</p>
      <p class="fine get"><a href="https://github.com/andredelgado/terramotos/releases/download/dataset/terramotos-portugal.zip">Download the data</a> (CSV, free for non-commercial use with credit to the sources)</p>
      <p class="fine" data-usage hidden>Cookieless usage counts by <a href="https://www.goatcounter.com/help/privacy" target="_blank" rel="noopener noreferrer">GoatCounter</a>. Respects Do Not Track and Global Privacy Control.</p>`,
    aView: 'View', vDrum: 'Seismograph', vList: 'List', vMap: 'Map', cTime: 'Time (UTC)', cPlace: 'Place', cDepth: 'Depth',
    lSizes: 'Magnitude 2, 4 and 6', lPlate: 'Plate boundaries', lFaults: 'Active faults', lVolc: 'Volcanoes', aLayers: 'Map layers',
    zIn: 'Zoom in', zOut: 'Zoom out', zReset: 'Show the whole region',
    aPeriod: 'Map period', p7d: '7d', p30d: '30d', p1y: '1y', pView: 'View', pAll: 'All', p10y: '10y',
    vStats: 'Statistics', aStatsPeriod: 'Statistics period',
    aColour: 'Colour of the earthquakes on the map', cNone: 'One colour', cByDepth: 'Colour by depth', cByAge: 'Colour by age',
    older: 'older', newer: 'newer', aPlay: 'Play this period through time', aPause: 'Pause', aScrub: 'Moment shown on the map',
    stories: 'Stories', storyAll: '← All stories', storiesIntro: 'Earthquakes that marked Portugal, each a way into the record.',
    readStory: 'Read the story', details: 'Details', pageMissing: 'This earthquake is not in the catalogue.',
    nearTitle: 'Nearby earthquakes', nearNone: 'No other earthquakes within 50 km in the week before and after.',
    near: (n) => (n === 1 ? '1 other earthquake' : `${n} other earthquakes`) + ' within 50 km in the week before and after.',
    nearMore: (n) => `The ${n} largest are listed.`, onDrum: 'Open on the seismograph', onMap: 'Open on the map', onList: 'Open in the list',
    stCount: 'Earthquakes', stPerDay: (n) => `${n} a day on average`, stPerYear: (n) => `${n} a year on average`,
    stLargest: 'Largest', stBusiest: 'Busiest day', stEnergy: 'Energy released', stEnergySub: (p) => `as one earthquake; ${p}% from the largest`,
    stPer: { year: 'Earthquakes per year', month: 'Earthquakes per month', day: 'Earthquakes per day' },
    stEnergyPer: { year: 'Energy released per year', month: 'Energy released per month', day: 'Energy released per day' },
    stEnergyNote: 'Shown as the magnitude of one earthquake releasing the same energy.',
    stPeak: (label, v) => `Peak: ${label} · ${v}`, stMag: 'Magnitude', stNoMag: 'No magnitude', stBelow2: 'Below 2', stDays: 'Busiest days',
    stNote: 'Before the 1960s only large earthquakes were recorded, so early counts are low. Energy is estimated from each magnitude (log E = 1.5 M + 4.8); magnitudes are on mixed scales. Select a bar or a day to open it on the seismograph.',
    stLoading: (n, total) => `Loading the catalogue: ${n} of ${total} years`,
    aRegionMap: (r, n) => `${r} map, ${n} earthquakes. Select a dot or use left and right arrows to select earthquakes.`,
    prelimShort: 'preliminary', none: 'No earthquakes match these filters.',
    aList: 'Earthquakes, newest first. Up and down arrows select the next or previous earthquake.',
    aRail: 'Timeline, newest at the top. Click or drag to travel in time.', aMap: 'Map showing where the earthquake was',
    loading: 'Loading…', loadingY: (y) => `Loading ${y}`, failedY: (y) => `Couldn't load ${y}, retrying`,
    inView: (n) => `${n} in view`, loadError: "Couldn't load the data. Reload to try again.",
    updated: (a) => `Updated ${a}`, offline: 'Offline', delayed: 'Updates delayed',
    offlineLoad: 'You’re offline. Reconnect to load earthquakes.',
    checking: 'Checking for updates…', ipmaFailed: 'IPMA: last update check failed',
    received: (s, t) => `${s}: data received ${t}`, catalogue: (t) => `Catalogue published ${t}`,
    emscConnected: 'EMSC live feed connected', emscDisconnected: 'EMSC live feed disconnected',
    now: 'just now', minAgo: (n) => `${n} min ago`, hAgo: (n) => `${n} h ago`, dAgo: (n) => `${n} days ago`,
    noMag: 'No magnitude', magBy: (a) => `Magnitude by ${a}`, deep: (d) => `${d} km deep`,
    felt: 'Felt', feltI: (i) => `Felt, intensity ${i}`, prelim: 'Preliminary · EMSC live feed', source: 'Source:',
    plTitle: 'Near a place', plIntro: 'Show only the earthquakes within a distance of a town.', plSearch: 'Town or city',
    plNone: 'No town with that name.', plRadius: 'Distance', plClear: 'Show everywhere', plMe: 'Use my location',
    plMeWait: 'Finding the nearest town…', plMeFail: 'Your location is not available.', plMeFar: 'You are far from Portugal: choose a town instead.',
    plPrivacy: 'Your location is only used in this browser, to find the nearest town.',
    plChip: (km, name) => `Within ${km} km of ${name}`, plFrom: (km, name) => `${km} km from ${name}`,
    close: 'Close', copy: 'Copy link', copied: 'Copied', E: 'E', W: 'W',
    openE: 'Open on EMSC', openI: 'Open in the ISC Bulletin', openU: 'Open on USGS', openP: 'Open IPMA seismicity',
  },
  pt: {
    loc: 'pt-PT', other: 'EN', aLang: 'Switch to English',
    months: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
    r0: 'Continente', r1: 'Açores', r2: 'Madeira', unit: ' sismos',
    s1d: 'Dia', s1w: 'Semana', s1mo: 'Mês', s1y: 'Ano', mag: 'Magnitude', region: 'Região', regionShort: 'Zona',
    jump: 'Ir para…', jumpShort: 'Ir…', latest: 'Mais recente', largest: 'Maiores sismos', decades: 'Décadas', decade: (d) => `Anos ${d}`,
    first: 'Primeiro sismo registado', data: 'Dados:', utc: 'Horas em UTC',
    aSpans: 'Tempo por linha', aMag: 'Magnitude mínima', aJump: 'Ir para', aTheme: 'Alternar entre claro e escuro',
    aDrum: 'Tambor de sismógrafo. Cada linha é um intervalo de tempo, a mais recente em cima; as ondas são sismos. Desça para recuar no tempo; as setas esquerda e direita saltam entre sismos.',
    about: 'Sobre',
    aboutHTML: (y) => `<h2 id="aboutTitle">Terramotos Portugal</h2>
      <p>Todos os sismos registados em Portugal continental, nos Açores e na Madeira desde ${y}, desenhados como num tambor de sismógrafo.</p>
      <ul>
        <li>A linha mais recente está em cima. Cada linha cobre o intervalo que escolher, de 3 horas a um ano, e lê-se da esquerda para a direita. O ponto vermelho é o momento atual.</li>
        <li>Cada onda é uma ilustração gerada a partir da magnitude de um sismo: quanto mais alta e comprida, mais forte. As ondas esbatidas e os pontos vazios no mapa não têm magnitude registada.</li>
        <li>Use a lista para consultar cada sismo. Clique num sismo para ver os detalhes, um mapa e uma ligação para partilhar. Com o teclado, use ← / → no tambor ou ↑ / ↓ na lista para saltar entre sismos.</li>
        <li>Antes da década de 1960 só se registavam os sismos grandes, por isso as linhas mais antigas parecem calmas. Com um ano por linha, os sismos abaixo de magnitude 3 aparecem como um perfil cinzento baixo e os de magnitude 5 ou mais levam a magnitude escrita.</li>
        <li>O mapa usa enquadramentos fixos para o Continente, os Açores e a Madeira, cada um com a sua escala. Os círculos exteriores representam a magnitude de forma simbólica; a intensidade sentida aparece nos detalhes quando é comunicada. Escolha um período ou traga o período visível do tambor ou da lista. As ligações do mapa preservam as datas exatas em UTC. Aproxime com os botões + e −, com dois dedos ou com Ctrl + roda do rato, e arraste para mover. Os botões por baixo dos mapas mostram ou escondem os limites de placas, as falhas ativas e os vulcões, e permitem colorir os sismos por profundidade ou por idade. O botão de reprodução percorre o período escolhido ao longo do tempo, de um dia ao registo inteiro.</li>
        <li>As Estatísticas contam os sismos que correspondem aos filtros, e as Histórias contam quatro deles.</li>
        <li>As magnitudes estão em escalas diferentes (ML, mb, Ms, Mw). Usa-se a magnitude do IPMA sempre que o IPMA a publicou.</li>
      </ul>
      <p class="fine">Dados do IPMA, do boletim do ISC, do EMSC e do USGS. Os sismos novos chegam em direto do EMSC e são preliminares até os catálogos os confirmarem. Contornos do mapa: Natural Earth; limites de placas: Bird (2003), conversão de Hugo Ahlenius, Nordpil; falhas ativas: GEM Global Active Faults Database (CC BY-SA 4.0); vulcões: Smithsonian Global Volcanism Program; localidades: GeoNames (CC BY 4.0).</p>
      <p class="fine get"><a href="https://github.com/andredelgado/terramotos/releases/download/dataset/terramotos-portugal.zip">Descarregar os dados</a> (CSV, uso não comercial livre, com referência às fontes)</p>
      <p class="fine" data-usage hidden>Contagens de utilização sem cookies pelo <a href="https://www.goatcounter.com/help/privacy" target="_blank" rel="noopener noreferrer">GoatCounter</a>. Respeita Do Not Track e Global Privacy Control.</p>`,
    aView: 'Vista', vDrum: 'Sismógrafo', vList: 'Lista', vMap: 'Mapa', cTime: 'Hora (UTC)', cPlace: 'Local', cDepth: 'Profundidade',
    lSizes: 'Magnitude 2, 4 e 6', lPlate: 'Limites de placas', lFaults: 'Falhas ativas', lVolc: 'Vulcões', aLayers: 'Camadas do mapa',
    zIn: 'Aproximar', zOut: 'Afastar', zReset: 'Mostrar a região inteira',
    aPeriod: 'Período do mapa', p7d: '7d', p30d: '30d', p1y: '1a', pView: 'Vista', pAll: 'Tudo', p10y: '10a',
    vStats: 'Estatísticas', aStatsPeriod: 'Período das estatísticas',
    aColour: 'Cor dos sismos no mapa', cNone: 'Uma cor', cByDepth: 'Cor por profundidade', cByAge: 'Cor por idade',
    older: 'mais antigos', newer: 'mais recentes', aPlay: 'Reproduzir este período ao longo do tempo', aPause: 'Pausa', aScrub: 'Momento mostrado no mapa',
    stories: 'Histórias', storyAll: '← Todas as histórias', storiesIntro: 'Sismos que marcaram Portugal, cada um uma porta de entrada no registo.',
    readStory: 'Ler a história', details: 'Detalhes', pageMissing: 'Este sismo não está no catálogo.',
    nearTitle: 'Sismos próximos', nearNone: 'Nenhum outro sismo a menos de 50 km na semana anterior e na seguinte.',
    near: (n) => (n === 1 ? '1 outro sismo' : `${n} outros sismos`) + ' a menos de 50 km na semana anterior e na seguinte.',
    nearMore: (n) => `Listam-se os ${n} maiores.`, onDrum: 'Abrir no sismógrafo', onMap: 'Abrir no mapa', onList: 'Abrir na lista',
    stCount: 'Sismos', stPerDay: (n) => `${n} por dia, em média`, stPerYear: (n) => `${n} por ano, em média`,
    stLargest: 'Maior', stBusiest: 'Dia com mais sismos', stEnergy: 'Energia libertada', stEnergySub: (p) => `como um só sismo; ${p}% vem do maior`,
    stPer: { year: 'Sismos por ano', month: 'Sismos por mês', day: 'Sismos por dia' },
    stEnergyPer: { year: 'Energia libertada por ano', month: 'Energia libertada por mês', day: 'Energia libertada por dia' },
    stEnergyNote: 'Apresentada como a magnitude de um único sismo que libertasse a mesma energia.',
    stPeak: (label, v) => `Máximo: ${label} · ${v}`, stMag: 'Magnitude', stNoMag: 'Sem magnitude', stBelow2: 'Abaixo de 2', stDays: 'Dias com mais sismos',
    stNote: 'Antes da década de 1960 só se registavam os sismos grandes, por isso as contagens antigas são baixas. A energia é estimada a partir de cada magnitude (log E = 1,5 M + 4,8); as magnitudes estão em escalas diferentes. Selecione uma barra ou um dia para o abrir no sismógrafo.',
    stLoading: (n, total) => `A carregar o catálogo: ${n} de ${total} anos`,
    aRegionMap: (r, n) => `${r}: ${n} sismos no mapa. Selecione um ponto ou use as setas esquerda e direita para selecionar sismos.`,
    prelimShort: 'preliminar', none: 'Nenhum sismo corresponde a estes filtros.',
    aList: 'Sismos, do mais recente para o mais antigo. As setas para cima e para baixo selecionam o sismo seguinte ou anterior.',
    aRail: 'Cronologia, o mais recente em cima. Clique ou arraste para viajar no tempo.', aMap: 'Mapa com o local do sismo',
    loading: 'A carregar…', loadingY: (y) => `A carregar ${y}`, failedY: (y) => `Falha ao carregar ${y}, a tentar de novo`,
    inView: (n) => `${n} visíveis`, loadError: 'Não foi possível carregar os dados. Recarregue a página.',
    updated: (a) => `Atualizado ${a}`, offline: 'Sem ligação', delayed: 'Atualizações em atraso',
    offlineLoad: 'Sem ligação à internet. Volte a ligar-se para carregar os sismos.',
    checking: 'A procurar atualizações…', ipmaFailed: 'IPMA: falha na última procura de atualizações',
    received: (s, t) => `${s}: dados recebidos ${t}`, catalogue: (t) => `Catálogo publicado ${t}`,
    emscConnected: 'Feed em direto do EMSC ligado', emscDisconnected: 'Feed em direto do EMSC desligado',
    now: 'agora mesmo', minAgo: (n) => `há ${n} min`, hAgo: (n) => `há ${n} h`, dAgo: (n) => `há ${n} dias`,
    noMag: 'Sem magnitude', magBy: (a) => `Magnitude segundo ${a}`, deep: (d) => `${d} km de profundidade`,
    felt: 'Sentido', feltI: (i) => `Sentido, intensidade ${i}`, prelim: 'Preliminar · EMSC em direto', source: 'Fonte:',
    plTitle: 'Perto de um lugar', plIntro: 'Mostra só os sismos a uma certa distância de uma localidade.', plSearch: 'Vila ou cidade',
    plNone: 'Nenhuma localidade com esse nome.', plRadius: 'Distância', plClear: 'Mostrar tudo', plMe: 'Usar a minha localização',
    plMeWait: 'A procurar a localidade mais próxima…', plMeFail: 'A sua localização não está disponível.', plMeFar: 'Está longe de Portugal: escolha uma localidade.',
    plPrivacy: 'A sua localização só é usada neste navegador, para encontrar a localidade mais próxima.',
    plChip: (km, name) => `A menos de ${km} km de ${name}`, plFrom: (km, name) => `A ${km} km de ${name}`,
    close: 'Fechar', copy: 'Copiar ligação', copied: 'Copiado', E: 'E', W: 'O',
    openE: 'Abrir no EMSC', openI: 'Abrir no boletim do ISC', openU: 'Abrir no USGS', openP: 'Abrir sismicidade do IPMA',
  },
};
