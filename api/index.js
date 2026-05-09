const express = require('express');
const session = require('express-session');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
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

app.get('/', (req, res) => {
  res.render('index', { 
    titre: "Anniversaire Benjamin · 10 mai 2026",
    consigne: "Choisis au moins une option : Voeux, Conseil, Reproche."
  });
});

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

app.get('/reponses', (req, res) => {
  if (!req.session.selectedOptions) return res.redirect('/');
  res.render('reponses', {
    options: req.session.selectedOptions,
    nom: req.session.nom,
    isAnonyme: req.session.isAnonyme
  });
});

app.post('/save', async (req, res) => {
  if (!req.session.selectedOptions) return res.redirect('/');
  
  const { nom, isAnonyme, selectedOptions } = req.session;
  
  const reponses = {};
  for (let opt of selectedOptions) {
    const contenu = req.body[opt] ? req.body[opt].trim() : '';
    if (!contenu) {
      return res.redirect('/reponses?error=champs');
    }
    reponses[opt] = contenu;
  }
  
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
    console.error(err1);
    return res.status(500).send('Erreur base de donnees');
  }
  
  for (let [type, contenu] of Object.entries(reponses)) {
    await supabase
      .from('reponses')
      .insert({
        submission_id: submission.id,
        type_reponse: type,
        contenu: contenu
      });
  }
  
  req.session.destroy();
  res.render('merci', { nom: nom });
});

module.exports = app;