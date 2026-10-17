# CARDROOM — проверка данных 16 октября 2026

Проверены семь турниров, 31 обновляемый статистический блок, календарь из 72 матчей (13–18 октября), пять сегодняшних пар. Отчёт не подтверждает 100% точность всех внешних данных.

## Сегодняшние матчи

| Матч | Выборка команд | Арбитр |
|---|---|---|
| [Leganés — Córdoba](https://www.espn.com/soccer/match/_/gameId/401883158) | Leganés: 9; Córdoba: 9 | [Eder Mallo](https://rfef.es/sites/default/files/designaciones_2a_division_masculina_-_temp_2026-27_-_jornada_10_viernes.pdf?cb=7375aee4) |
| [Eintracht Frankfurt — FC Cologne](https://www.espn.com/soccer/match/_/gameId/401884770) | Eintracht Frankfurt: 5; FC Cologne: 5 | [Benjamin Brand](https://datencenter.dfb.de/datencenter/bundesliga/2026-2027/6-spieltag/eintracht-frankfurt-1-fc-koeln-2419342) |
| [Le Mans — Toulouse](https://www.espn.com/soccer/match/_/gameId/401876437) | Le Mans: 6; Toulouse: 6 | [Aurélien Petit](https://ligue1.com/fr/articles/l1_article_5927-les-arbitres-de-la-7e-journee-de-ligue-1-mc-donald-s-1) |
| [Frosinone — Sassuolo](https://www.espn.com/soccer/match/_/gameId/401874959) | Frosinone: 6; Sassuolo: 6 | [Matteo Marchetti](https://www.frosinonecalcio.com/frosinone-sassuolo-arbitra-il-signor-matteo-marchetti/) |
| [Deportivo — Levante](https://www.espn.com/soccer/match/_/gameId/401882844) | Deportivo: 8; Levante: 7 | [Manuel Jesús Orellana](https://rfef.es/sites/default/files/designaciones_1a_division_masculina_-_temp_2026-27_-_jornada_9_viernes.pdf?cb=257a48d7) |

## Выводы и исправления

- История команд больше не обрезается до пяти игр: используются доступные завершённые матчи текущего сезона и турнира, максимум 60 на команду.
- Для Deportivo — Levante выборка увеличилась с 5+5 до 8+7 игр. По той же формуле шанс 3 и более голов изменился примерно с 73% до 64%. Это эффект смены выборки, а не доказанная точность прогноза.
- Обнаружено расхождение поставщиков для Leganés — Córdoba: за 9 игр LaLiga DISPAROS 76/103, ESPN totalShots 96/137; фолы Córdoba 151 против 150. Определения и причины расхождения полностью не установлены. В карточке используется единая поматчевая серия ESPN; официальный срез сохранён отдельно.
- Профиль Marco Guida обновлён после матча 13 октября: 6 матчей, 22 ЖК, 0 КК, 136 фолов. Турниры показаны раздельно.
- Проверены даты и арифметика 9 архивных профилей арбитров: 63 основных матча, 231 ЖК, 9 КК; ещё 7 строк идут отдельно. Независимо перепроверены не все 63 матча.
- Архив 45 игроков в 9 матчах и отдельная подборка из 6 игроков сохранены с исходными датами. Выборочно повторно сверены Ferri, Hadj Moussa, Wirtz, Malen, Haaland, Osimhen; это не полная повторная верификация 51 записи.

## Ограничения

- Все 10 показателей найдены у обеих команд пяти сегодняшних матчей. Это подтверждение наличия и расчёта данных поставщика, не независимая проверка каждого события по видео.
- В полученных данных 30 выбранных игроков отсутствует minutesPlayed: минуты не восстановлены догадками. Голы и выходы подтверждены поматчевыми строками ESPN.
- Стартовые составы, травмы и дисквалификации требуют новой проверки перед игрой. Клубная заявка не равна стартовому составу.
- Общие таблицы команд и угловых в нескольких турнирах неполные; отсутствие строки не означает нулевой показатель.
- Модель Пуассона не откалибрована и не проверена на отложенной выборке. Проценты, особенно для карточек, ударов и фолов, являются сценарными оценками.
- Проверка интерфейса в браузере недоступна из-за существующего ограничения доступа; выполнены проверки кода, данных и сборки.

## Источники и покрытие

| Турнир | Команды ЖК | Команды угловые | Арбитры |
|---|---:|---:|---:|
| [Premier League](https://footystats.org/england/premier-league/card-stats) | 20 | 20 | 19 |
| [Лига чемпионов](https://footystats.org/europe/uefa-champions-league/card-stats) | 3 | 0 | 18 |
| [La Liga](https://footystats.org/spain/la-liga/card-stats) | 20 | 20 | 18 |
| [Segunda](https://footystats.org/spain/segunda-division/card-stats) | 0 | 0 | 18 |
| [Serie A](https://footystats.org/italy/serie-a/card-stats) | 20 | 0 | 18 |
| [Bundesliga](https://footystats.org/germany/bundesliga/card-stats) | 10 | 0 | 18 |
| [Ligue 1](https://footystats.org/france/ligue-1/card-stats) | 18 | 18 | 17 |

## Реестр запросов

- 2026-10-16T16:20:31.752Z · HTTP 200 · https://footystats.org/england/premier-league/card-stats
- 2026-10-16T16:20:36.185Z · HTTP 200 · https://footystats.org/england/premier-league
- 2026-10-16T16:20:36.303Z · HTTP 200 · https://footystats.org/europe/uefa-champions-league/card-stats
- 2026-10-16T16:20:36.436Z · HTTP 200 · https://footystats.org/europe/uefa-champions-league
- 2026-10-16T16:20:36.790Z · HTTP 200 · https://footystats.org/spain/la-liga/card-stats
- 2026-10-16T16:20:36.893Z · HTTP 200 · https://footystats.org/spain/la-liga
- 2026-10-16T16:20:37.182Z · HTTP 200 · https://footystats.org/spain/segunda-division/card-stats
- 2026-10-16T16:20:37.519Z · HTTP 200 · https://footystats.org/spain/segunda-division
- 2026-10-16T16:20:37.656Z · HTTP 200 · https://footystats.org/italy/serie-a/card-stats
- 2026-10-16T16:20:37.759Z · HTTP 200 · https://footystats.org/italy/serie-a
- 2026-10-16T16:20:37.952Z · HTTP 200 · https://footystats.org/germany/bundesliga/card-stats
- 2026-10-16T16:20:38.086Z · HTTP 200 · https://footystats.org/germany/bundesliga
- 2026-10-16T16:20:38.191Z · HTTP 200 · https://footystats.org/france/ligue-1/card-stats
- 2026-10-16T16:20:39.432Z · HTTP 200 · https://footystats.org/france/ligue-1
- 2026-10-16T16:20:31.762Z · HTTP 200 · https://footiqo.com/statistics/teams/cards/full-time-europe-champions-league/
- 2026-10-16T16:20:40.067Z · HTTP 200 · https://footiqo.com/statistics/teams/cards/full-time-germany-bundesliga/
- 2026-10-16T16:20:31.761Z · HTTP 200 · https://www.betaminic.com/statistics/yellow-card-stats-premier-league/
- 2026-10-16T16:20:42.055Z · HTTP 200 · https://www.betaminic.com/statistics/corner-stats-premier-league/
- 2026-10-16T16:20:45.450Z · HTTP 200 · https://www.betaminic.com/statistics/yellow-card-stats-la-liga/
- 2026-10-16T16:20:48.888Z · HTTP 200 · https://www.betaminic.com/statistics/corner-stats-la-liga/
- 2026-10-16T16:20:52.190Z · HTTP 200 · https://www.betaminic.com/es/estadisticas/estadisticas-tarjetas-amarillas-serie-a/
- 2026-10-16T16:20:55.622Z · HTTP 200 · https://www.betaminic.com/statistics/yellow-card-stats-ligue-1/
- 2026-10-16T16:20:59.734Z · HTTP 200 · https://www.betaminic.com/statistics/corner-stats-ligue-1/
- 2026-10-16T16:21:04.329Z · HTTP 200 · https://footiqo.com/statistics/leagues/cards/full-time/
- 2026-10-16T16:21:11.359Z · HTTP 200 · https://footiqo.com/statistics/referees/cards/full-time/
- 2026-10-16T16:21:11.621Z · HTTP 200 · https://valuestats.com/en/league/la-liga/referees/
- 2026-10-16T16:21:16.889Z · HTTP 200 · https://valuestats.com/en/league/la-liga-2/referees/
- 2026-10-16T16:21:11.621Z · HTTP 200 · https://balonario.com/en/referees/bundesliga/
- 2026-10-16T16:21:17.251Z · HTTP 200 · https://valuestats.com/en/league/champions-league/referees/
- 2026-10-16T16:21:17.586Z · HTTP 200 · https://valuestats.com/en/league/ligue-1/referees/
- 2026-10-16T16:21:17.839Z · HTTP 200 · https://valuestats.com/en/league/serie-a-italy/referees/
- 2026-10-16T16:21:11.620Z · HTTP 200 · https://www.soccerbase.com/referees/home.sd
- 2026-10-16T16:21:53.682Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883158
- 2026-10-16T16:22:04.830Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/teams/17534/schedule?season=2026
- 2026-10-16T16:22:05.032Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/teams/8447/schedule?season=2026
- 2026-10-16T16:22:05.147Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883189
- 2026-10-16T16:22:05.148Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883199
- 2026-10-16T16:22:05.147Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883194
- 2026-10-16T16:22:05.149Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883204
- 2026-10-16T16:22:11.763Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883176
- 2026-10-16T16:22:11.764Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883245
- 2026-10-16T16:22:11.761Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883209
- 2026-10-16T16:22:11.764Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883251
- 2026-10-16T16:22:19.172Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883184
- 2026-10-16T16:22:19.171Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883259
- 2026-10-16T16:22:19.172Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883197
- 2026-10-16T16:22:19.172Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883161
- 2026-10-16T16:22:19.301Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883213
- 2026-10-16T16:22:19.301Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883221
- 2026-10-16T16:22:19.301Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883216
- 2026-10-16T16:22:19.300Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883171
- 2026-10-16T16:22:19.529Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883230
- 2026-10-16T16:22:19.529Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/summary?event=401883224
- 2026-10-16T16:22:19.677Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884770
- 2026-10-16T16:22:19.785Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/teams/125/schedule?season=2026
- 2026-10-16T16:22:19.882Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/teams/122/schedule?season=2026
- 2026-10-16T16:22:19.990Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884787
- 2026-10-16T16:22:19.990Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884805
- 2026-10-16T16:22:19.990Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884794
- 2026-10-16T16:22:19.990Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884780
- 2026-10-16T16:22:20.111Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884792
- 2026-10-16T16:22:20.111Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884774
- 2026-10-16T16:22:20.111Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884785
- 2026-10-16T16:22:20.111Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884811
- 2026-10-16T16:22:20.241Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884808
- 2026-10-16T16:22:20.241Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/summary?event=401884810
- 2026-10-16T16:22:20.416Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876437
- 2026-10-16T16:22:20.504Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams/2697/schedule?season=2026
- 2026-10-16T16:22:20.611Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/teams/179/schedule?season=2026
- 2026-10-16T16:22:20.714Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876455
- 2026-10-16T16:22:20.714Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876470
- 2026-10-16T16:22:20.714Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876442
- 2026-10-16T16:22:20.714Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876463
- 2026-10-16T16:22:20.853Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876450
- 2026-10-16T16:22:20.853Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876491
- 2026-10-16T16:22:20.853Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876478
- 2026-10-16T16:22:20.853Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876444
- 2026-10-16T16:22:21.031Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876486
- 2026-10-16T16:22:21.031Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876468
- 2026-10-16T16:22:21.030Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876461
- 2026-10-16T16:22:21.031Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/summary?event=401876483
- 2026-10-16T16:22:21.213Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874959
- 2026-10-16T16:22:21.347Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/teams/4057/schedule?season=2026
- 2026-10-16T16:22:21.450Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/teams/3997/schedule?season=2026
- 2026-10-16T16:22:21.579Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874752
- 2026-10-16T16:22:21.579Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874768
- 2026-10-16T16:22:21.579Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874991
- 2026-10-16T16:22:21.578Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874754
- 2026-10-16T16:22:21.780Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874930
- 2026-10-16T16:22:21.780Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874756
- 2026-10-16T16:22:21.780Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874789
- 2026-10-16T16:22:21.779Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874942
- 2026-10-16T16:22:21.894Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874751
- 2026-10-16T16:22:21.894Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874750
- 2026-10-16T16:22:21.895Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874748
- 2026-10-16T16:22:21.895Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/summary?event=401874743
- 2026-10-16T16:22:22.028Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882844
- 2026-10-16T16:22:22.151Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/90/schedule?season=2026
- 2026-10-16T16:22:22.261Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/teams/1538/schedule?season=2026
- 2026-10-16T16:22:22.407Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882863
- 2026-10-16T16:22:22.407Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882873
- 2026-10-16T16:22:22.407Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882884
- 2026-10-16T16:22:22.406Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882847
- 2026-10-16T16:22:22.532Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882910
- 2026-10-16T16:22:22.532Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882904
- 2026-10-16T16:22:22.531Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882887
- 2026-10-16T16:22:22.532Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882923
- 2026-10-16T16:22:22.649Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882883
- 2026-10-16T16:22:22.650Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882890
- 2026-10-16T16:22:22.649Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882852
- 2026-10-16T16:22:22.649Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882857
- 2026-10-16T16:22:22.810Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882909
- 2026-10-16T16:22:22.810Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882922
- 2026-10-16T16:22:22.809Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/summary?event=401882902
- 2026-10-16T16:26:02.449Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20261017
- 2026-10-16T16:26:02.587Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard?dates=20261018
- 2026-10-16T16:26:02.658Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20261013
- 2026-10-16T16:26:02.774Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions/scoreboard?dates=20261014
- 2026-10-16T16:26:02.881Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20261016
- 2026-10-16T16:26:02.966Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20261017
- 2026-10-16T16:26:03.106Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.1/scoreboard?dates=20261018
- 2026-10-16T16:26:03.213Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard?dates=20261016
- 2026-10-16T16:26:03.310Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard?dates=20261017
- 2026-10-16T16:26:03.446Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/esp.2/scoreboard?dates=20261018
- 2026-10-16T16:26:03.517Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=20261016
- 2026-10-16T16:26:03.657Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=20261017
- 2026-10-16T16:26:03.753Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ita.1/scoreboard?dates=20261018
- 2026-10-16T16:26:03.849Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard?dates=20261016
- 2026-10-16T16:26:03.958Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard?dates=20261017
- 2026-10-16T16:26:04.061Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/ger.1/scoreboard?dates=20261018
- 2026-10-16T16:26:04.129Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=20261016
- 2026-10-16T16:26:04.269Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=20261017
- 2026-10-16T16:26:04.361Z · HTTP 200 · https://site.api.espn.com/apis/site/v2/sports/soccer/fra.1/scoreboard?dates=20261018
