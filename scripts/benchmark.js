import { readFileSync } from "node:fs";
import { execute } from "../js/engine.js";
import { defaults } from "../js/state.js";
let start = performance.now();
const summary = execute("loadCollection", {sources: ["allocine_brut.csv","allocine_movies_2026.csv"].map(name=>({name,text:readFileSync("data/source/"+name,"utf8")}))});
console.log(
  "Films:",
  summary.count,
  "; parsing + normalization:",
  Math.round(performance.now() - start),
  "ms",
);
const config = defaults();
for (const label of ["All movies", "Combined filters"]) {
  if (label === "Combined filters")
    Object.assign(config.filters, {
      genres: ["Thriller"],
      yearMin: 1990,
      yearMax: 1999,
      ratingMin: 4,
      votesMin: 100,
    });
  const times = [];
  let result;
  for (let i = 0; i < 5; i++) {
    start = performance.now();
    result = execute("query", { config, page: 1 });
    times.push(performance.now() - start);
  }
  console.log(
    label,
    ":",
    result.total,
    "films; average",
    Math.round(times.reduce((a, b) => a + b) / times.length),
    "ms; page",
    result.rows.length,
  );
}
