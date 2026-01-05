// executor/src/routes/projects.js
const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { authenticate } = require('../middleware/auth');

// GET /api/projects - Haal projecten op voor gebruiker
router.get('/', authenticate, async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }
    
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data || []);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects - Maak nieuw project
router.post('/', authenticate, async (req, res) => {
  try {
    const projectData = req.body;
    
    // Voeg user_id toe als die nog niet bestaat
    if (!projectData.user_id && req.user?.id) {
      projectData.user_id = req.user.id;
    }
    
    // Voeg timestamps toe
    projectData.created_at = new Date().toISOString();
    projectData.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('projects')
      .insert([projectData])
      .select()
      .single();
    
    if (error) {
      console.error('Supabase insert error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.status(201).json(data);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id - Verwijder project
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check of project bestaat en van de juiste gebruiker is
    const { data: existingProject, error: fetchError } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', id)
      .single();
    
    if (fetchError) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Verwijder project
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);
    
    if (error) {
      console.error('Supabase delete error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.status(204).send();
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:id - Update project
router.patch('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Voeg updated_at timestamp toe
    updates.updated_at = new Date().toISOString();
    
    const { data, error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      console.error('Supabase update error:', error);
      return res.status(500).json({ error: error.message });
    }
    
    res.json(data);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
