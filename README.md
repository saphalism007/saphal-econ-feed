# saphal-econ-feed

The daily news file for the [Saphal Economics PhD](https://saphalism007.github.io/saphal-economics-phd/) app.

`build.mjs` reads public RSS and Atom feeds (economics news, Nepal and South Asia, central banks and institutions, research networks, commentary, and scholarship and PhD calls), keeps recent items, tags them, and writes `feed.json`. A GitHub Action runs it twice a day and GitHub Pages serves the file at https://saphalism007.github.io/saphal-econ-feed/feed.json.

Each item keeps its own headline, source, date and link. Scholarship items come from secondary sites and news reports: always confirm the details on the official page.

Run locally with `node build.mjs` (Node 20 or newer, no dependencies).
