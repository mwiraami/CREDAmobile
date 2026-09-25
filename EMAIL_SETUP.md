# Activer les e-mails Creda avec EmailJS

1. Créez un compte sur EmailJS.
2. Ajoutez votre fournisseur d'e-mail dans **Email Services**.
3. Créez un modèle avec ces variables : `{{to_email}}`, `{{user_name}}`, `{{user_email}}`, `{{app_name}}`.
4. Copiez les identifiants EmailJS dans `mail-config.js` :
   - `publicKey`
   - `serviceId`
   - `templateId`
5. Ouvrez l'application avec le serveur local, puis créez un nouveau compte.

Le formulaire envoie l'e-mail à `to_email`, qui correspond à l'adresse saisie par l'utilisateur. Le mot de passe n'est jamais envoyé dans l'e-mail.

Pour un déploiement public, ne mettez jamais de mot de passe SMTP dans le navigateur. EmailJS utilise une clé publique côté client ; pour une sécurité et une délivrabilité renforcées, utilisez ensuite un backend avec une clé privée.
