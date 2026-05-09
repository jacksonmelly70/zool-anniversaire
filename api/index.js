const express = require('express');
const session = require('express-session');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

// Vérification des variables d'environnement au démarrage
console.log("=== Vérification des variables d'environnement ===");
console.log("SUPABASE_URL existe ?", !!process.env.SUPABASE_URL);
console.log("SUPABASE_ANON_KEY existe ?", !!process.env.SUPABASE_ANON_KEY);
console.log("SESSION_SECRET existe ?", !!process.env.SESSION_SECRET);
if (process.env.SUPABASE_URL) {
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("ERREUR CRITIQUE: Variables Supabase manquantes !");
}

const supabase = createClient(supabaseUrl, supabaseKey);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'un-secret-provisoire',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

// Page d'accueil
app.get('/', (req, res) => {
  res.render('index', { 
    titre: "Anniversaire Benjamin · 10 mai 2026",
    consigne: "Choisis au moins une option : Voeux, Conseil, Reproche."
  });
});

// Traitement des choix
app.post('/init', async (req, res) => {
  let { options, anonyme, nom } = req.body;
  
  let selected = [];
  if (typeof options === 'string') selected = [options];
  else if (Array.isArray(options)) selected = options;
  
  if (selected.length === 0) {
    return res.redirect('/?error=choix');
  }
  
  const isAnonyme = anonyme === 'on';
  let nomUtilisateur = 'Anonyme';
  if (!isAnonyme) {
    if (!nom || nom.trim() === '') {
      return res.redirect('/?error=nom');
    }
    nomUtilisateur = nom.trim();
  }
  
  req.session.selectedOptions = selected;
  req.session.nom = nomUtilisateur;
  req.session.isAnonyme = isAnonyme;
  
  res.redirect('/reponses');
});

// Page d'écriture des messages
app.get('/reponses', (req, res) => {
  if (!req.session.selectedOptions) return res.redirect('/');
  res.render('reponses', {
    options: req.session.selectedOptions,
    nom: req.session.nom,
    isAnonyme: req.session.isAnonyme
  });
});

// Sauvegarde dans Supabase (avec debug amélioré)
app.post('/save', async (req, res) => {
  if (!req.session.selectedOptions) {
    console.log("Pas de session selectedOptions");
    return res.redirect('/');
  }
  
  try {
    const { nom, isAnonyme, selectedOptions } = req.session;
    console.log("=== Nouvel envoi ===");
    console.log("Nom:", nom);
    console.log("Anonyme:", isAnonyme);
    console.log("Options sélectionnées:", selectedOptions);
    
    const reponses = {};
    for (let opt of selectedOptions) {
      const contenu = req.body[opt] ? req.body[opt].trim() : '';
      if (!contenu) {
        return res.redirect('/reponses?error=champs');
      }
      reponses[opt] = contenu;
      console.log(`Message ${opt}:`, contenu.substring(0, 50));
    }
    
    console.log("Tentative d'insertion dans Supabase...");
    
    const { data: submission, error: err1 } = await supabase
      .from('submissions')
      .insert({
        nom: nom,
        est_anonyme: isAnonyme,
        date_creation: new Date().toISOString()
      })
      .select()
      .single();
    
    if (err1) {
      console.error("Erreur Supabase (submissions):", err1);
      console.error("Message d'erreur:", err1.message);
      return res.status(500).send(`Erreur base de données: ${err1.message}`);
    }
    
    console.log("Submission créée avec ID:", submission.id);
    
    for (let [type, contenu] of Object.entries(reponses)) {
      console.log(`Insertion réponse ${type}...`);
      const { error: err2 } = await supabase
        .from('reponses')
        .insert({
          submission_id: submission.id,
          type_reponse: type,
          contenu: contenu
        });
      
      if (err2) {
        console.error(`Erreur insertion ${type}:`, err2);
      }
    }
    
    console.log("Envoi réussi !");
    req.session.destroy();
    res.render('merci', { nom: nom });
    
  } catch (error) {
    console.error("Exception attrapée:", error);
    console.error("Stack:", error.stack);
    res.status(500).send(`Erreur serveur: ${error.message}`);
  }
});

module.exports = app;
