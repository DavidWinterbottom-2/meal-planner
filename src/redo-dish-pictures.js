// Queue a new picture for every dish that has one, e.g. after the picture
// style changes. Old pictures stay shown until their new one is saved; the
// running app's worker makes them as the desktop is up. Run inside the
// container: docker exec meal-planner node src/redo-dish-pictures.js

import { openStore } from "./store.js";

const store = openStore(process.env.MEALS_DB || "/data/meals.db");
const n = store.redoAllDishes(new Date().toISOString());
store.close();
console.log(`Queued ${n} dish picture${n === 1 ? "" : "s"} for a new picture.`);
