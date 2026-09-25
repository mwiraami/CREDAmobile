# Activer les comptes sur plusieurs téléphones

1. Ouvrez la console Firebase et créez un projet.
2. Dans Authentication > Sign-in method, activez **Email/Password**.
3. Dans Firestore Database, créez une base en mode production.
4. Publiez le contenu de `firestore.rules` dans les règles Firestore.
5. Ajoutez une application Web dans Project settings > Your apps.
6. Copiez sa configuration dans `firebase-config.js`.
7. Hébergez Creda en HTTPS. `localhost` fonctionne uniquement pour les tests.

Les utilisateurs se connecteront avec le même e-mail et mot de passe depuis n’importe quel téléphone. Leurs dettes, dépenses, budgets et réglages seront enregistrés dans leur document Firestore privé.
