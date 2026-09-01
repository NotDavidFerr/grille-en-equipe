# Grille en Équipe — version en ligne (Render / Railway)

Ce dossier contient exactement le même jeu que la version Wifi local, prêt à
être déployé sur un hébergeur gratuit. Une fois en ligne, tes joueurs pourront
rejoindre une partie depuis n'importe où (pas seulement le même Wifi).

## Étape 1 — Mettre le code sur GitHub

Render et Railway déploient à partir d'un dépôt GitHub.

1. Crée un compte gratuit sur https://github.com si tu n'en as pas.
2. Crée un nouveau dépôt (bouton **New repository**), par exemple nommé
   `grille-en-equipe`. Laisse-le vide (sans README).
3. Depuis ce dossier, dans un terminal, tape :

```
git init
git add .
git commit -m "Premier envoi du jeu"
git branch -M main
git remote add origin https://github.com/TON-PSEUDO/grille-en-equipe.git
git push -u origin main
```

(Remplace `TON-PSEUDO` par ton nom d'utilisateur GitHub — l'adresse exacte est
affichée sur la page de ton nouveau dépôt.)

## Étape 2A — Déployer sur Render (recommandé)

1. Va sur https://render.com et crée un compte gratuit (tu peux te connecter
   directement avec ton compte GitHub).
2. Clique sur **New +** → **Web Service**.
3. Choisis le dépôt `grille-en-equipe` que tu viens de créer.
4. Render détecte automatiquement Node.js. Vérifie ces réglages :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Instance Type** : `Free`
5. Clique sur **Create Web Service**. Le déploiement prend 1 à 2 minutes.
6. Une fois prêt, Render affiche une adresse du type
   `https://grille-en-equipe.onrender.com` — c'est l'adresse à partager avec
   tes joueurs.

**À savoir** : sur le plan gratuit, le serveur s'endort après ~15 minutes sans
visite, et met 30 à 60 secondes à se réveiller au prochain accès. Ouvre le
lien une minute avant de commencer à jouer pour éviter l'attente.

## Étape 2B — Déployer sur Railway (alternative)

1. Va sur https://railway.app et connecte-toi avec GitHub.
2. Clique sur **New Project** → **Deploy from GitHub repo**.
3. Sélectionne `grille-en-equipe`.
4. Railway détecte Node.js et déploie automatiquement.
5. Dans l'onglet **Settings** du service, clique sur **Generate Domain** pour
   obtenir une adresse publique du type
   `https://grille-en-equipe-production.up.railway.app`.

**À savoir** : le plan gratuit de Railway fonctionne par crédit mensuel
limité plutôt que par mise en veille — largement suffisant pour jouer entre
amis de temps en temps.

## Étape 3 — Jouer

Une fois l'adresse en ligne obtenue :

1. Partage-la avec tes joueurs (message, SMS, etc. — plus besoin d'être sur
   le même Wifi).
2. Chacun l'ouvre dans son navigateur de téléphone.
3. Un joueur clique sur **« Créer une salle »**, obtient un code à 4 lettres,
   le partage.
4. Les autres cliquent sur **« Rejoindre une partie »** avec ce code.
5. L'hôte lance la partie, tout le monde remplit la grille ensemble.

## Mettre à jour le jeu plus tard

Si tu modifies `server.js` ou `public/index.html` (par exemple pour ajouter
une nouvelle grille), il suffit de renvoyer le code sur GitHub :

```
git add .
git commit -m "Nouvelle grille"
git push
```

Render et Railway redéploient automatiquement à chaque envoi.

## Limites à connaître

- Les salles de jeu vivent en mémoire sur le serveur : si celui-ci redémarre
  (mise en veille, redéploiement), les parties en cours sont perdues. Pour un
  jeu entre amis, ce n'est pas gênant — il suffit de recréer une salle.
- 5 grilles sont incluses (Généraliste, Cuisine, Voyage, Cinéma, Sport). Une
  grille est tirée au hasard à chaque création de salle, et une nouvelle est
  retirée à chaque fois qu'on clique sur « Rejouer dans cette salle ».
  Elles vivent toutes dans **`data/puzzles.json`**, un fichier à part —
  ni `server.js` ni `public/index.html` n'ont besoin d'être modifiés pour en
  ajouter. Une grille mal formée dans ce fichier est simplement ignorée (avec
  un message dans les logs du serveur), sans empêcher le jeu de démarrer.
  Dis-moi si tu veux que j'en ajoute d'autres — après un ajout, un simple
  `git push` suffit pour les mettre en ligne (pas besoin de reconstruire quoi
  que ce soit).
