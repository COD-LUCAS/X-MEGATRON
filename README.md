# X - MEGATRON- WhatsApp Bot (Baileys)

A minimal, **multi-session WhatsApp bot** built using **Baileys**.  
This project is designed to be lightweight, extendable, and compatible with **Render**.

---

### FORK THIS REPO

1. Must Fork This Repo Before Deployment!
   <br> 
<a href="https://github.com/COD-LUCAS/X-MEGATRON-/fork">
  <img title="FORK REPO" src="https://img.shields.io/badge/FORK REPO-h?color=black&style=for-the-badge&logo=stackshare">
</a>

---

## - Scan QR & Generate Session

Click the button below to scan the QR code and generate your **SESSION ID**:

<a href="https://megatron-home.onrender.com/" target="_blank">
  <img
    alt="SCAN QR"
    src="https://img.shields.io/badge/Scan_QR-000000?style=for-the-badge&logo=scan&logoColor=white"
  />
</a>

---

### DEPLOY TO RENDER

1. If you don't have a Render account, create one.  
   <br>
<a href='https://dashboard.render.com/register' target="_blank">
  <img alt='Render' src='https://img.shields.io/badge/-Create-black?style=for-the-badge&logo=render&logoColor=white'/>
</a>

2. Get [DATABASE_URL](https://dashboard.render.com)  

3. Get your [Render API key](https://dashboard.render.com/u/settings#api-keys)  

4. Now deploy:  
   <br>
<a href='https://dashboard.render.com/web/new' target="_blank">
  <img alt='Render Deploy' src='https://img.shields.io/badge/-DEPLOY-black?style=for-the-badge&logo=render&logoColor=white'/>
</a>

---


### Steps
1. Open the QR page  
2. Scan the QR using WhatsApp  
3. Copy the generated **SESSION ID**

---

## - Important Notice

This bot is **NOT ready to use by default**.

You **must** configure the following environment variables before running:

- `SESSION_ID`
- `OWNER`
- `PREFIX`
- `MODE`

If these are not set correctly, the bot **will not work**.

---

## ✨ Features

- ✅ Multi-session support  
- ✅ Session loading from **Pastebin**  
- ✅ Plugin-based command system  
- ✅ Clean, step-by-step startup logs  
- ✅ Local **PM2** support  
- ✅ Fully **Render compatible**

---

## 📦 Requirements

- **Node.js v20+**
- A valid **Baileys session** stored on Pastebin
- Basic knowledge of **environment variables**

---

## 🚀 Setup Guide

1. **Fork** this repository  
2. Create a `.env` file in the root directory  
3. Add your environment variables:
   ```env
   SESSION_ID=your_session_id_here
   OWNER=your_number_here
   PREFIX=!
   MODE=public

