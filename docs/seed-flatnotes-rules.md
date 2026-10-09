# Seed the meal-planning rules into Flatnotes

The planning rules live in four Flatnotes notes. The Meal Planner never reads
or writes them: it tells Claude their titles, and Claude reads and edits them
with the Flatnotes connector. Run this
once, in a claude.ai chat with the **Flatnotes** connector enabled, by pasting
everything below the line.

The note titles must match exactly. These are the server's defaults; if you
change a title, set the matching `MEALS_RULE_NOTE_*` variable in the server's
`.env`.

---

Please create these four notes in Flatnotes with `save_note`, using exactly
these titles and contents. Don't add a date header, task list or tags, and
don't restructure them. The Meal Planner server reads them verbatim. If a note
with the same title already exists, stop and ask me before overwriting it.

**Title:** `Meals - Household`

```markdown
- David and Lisa, plus Thomas (toddler). Thomas is at Kita Mon–Wed and home Thu–Sun.
- Mon–Wed dinners are pre-cooked, quick or from the freezer. Sunday is the batch-cook/prep day for the week ahead.
- Mon–Wed lunch is "Kita" for Thomas (write it into the plan; Kita holiday weeks get a real lunch).
- Thomas's lunches on home days rotate through:
  - fried tortilla with homemade tomato sauce, cheese and ham
  - pasta and spinach
  - tomato pasta
  - boiled egg and cheese on toast
  - rösti with egg and bacon

  Add cottage cheese to all lunches. Snacks: fruit, crackers, Babybel, veggie sticks.

- Homemade tomato or hidden-veg pasta sauce is batch-cooked and keeps about a week. Top it up as a prep task.
- Thomas likes prawns. Food is mild and toddler-friendly. David likes pork, Lisa likes salmon (a balsamic pork/salmon night suits both).
- Check the Cozi calendar for the planning window before finalising: evenings out, trips, visitors.
- Plan in chat first and iterate. Save to the planner only once agreed.
```

**Title:** `Meals - Meal Bank`

```markdown
- Quick (Mon–Wed):
  - tomato pasta / hidden veg pasta
  - sausages with mash or sweet potato, broccoli, sweetcorn
  - meatballs and mash (from the freezer)
  - fish fingers or fish nuggets with carrot chips and peas
  - baked chicken drumsticks
  - fish with lemon sage butter
  - spinach and feta parcels
- Mid-week / Fri:
  - quesadillas
  - homemade pizza
  - mild prawn ramen
  - fried rice with prawns, bacon and egg (needs rice cooked 1–5 days before)
  - mild chicken or lamb curry with rice
  - marinated salmon with rice or potatoes
  - grilled white fish with roast potatoes and veg
- Weekend:
  - roast chicken / BBQ chicken with special chips
  - roast beef or pork with Yorkshire puddings
  - Älplermagronen with mince and apple sauce
  - lamb fajitas
  - meatballs and tacos
```

**Title:** `Meals - Recipes`

```markdown
- **Veggie flapjacks.** Grate 1 carrot. Mix with 3 tbsp sweetcorn, 1 egg and 3 tbsp flour, plus a splash of milk if too thick. Fry spoonfuls for 2–3 min per side.
- **Mild prawn ramen.** Simmer 500 ml stock with 1 tsp soy sauce. Add sweetcorn or peas for 2–3 min, then prawns until pink. Cook the noodles separately, combine, and top with spring onion and an optional egg.
```

**Title:** `Meals - Pantry`

```markdown
_As of 6 Sep 2026, likely out of date._

- Freezer: salmon, white fish, beef roasting joint, bratwurst and cervelat, prawns, mince, lamb, pork escalopes, bacon pieces, pastry sheets, spinach.
- Cellar: fusilli, spirali, spaghetti, hörnli, basmati rice, rösti, oats, tinned tomatoes, red wine vinegar.
```

When all four are saved, list their titles back to me.
