const express = require("express");
const { insertLink, listLinks, deleteLink } = require("../db");
const { fetchPageTitle } = require("../linkTitle");

function parseTags(raw) {
  return String(raw || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function isValidUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

function buildLinksRouter(config) {
  const router = express.Router();

  router.get("/", (req, res) => {
    const links = listLinks();
    const allTags = Array.from(new Set(links.flatMap((l) => l.tags))).sort((a, b) =>
      a.localeCompare(b, "fr")
    );
    res.render("links", { config, links, allTags });
  });

  router.post("/", async (req, res) => {
    const url = String(req.body.url || "").trim();
    const type = req.body.type === "video" ? "video" : "site";
    const description = String(req.body.description || "").trim();
    const tags = parseTags(req.body.tags);
    let title = String(req.body.title || "").trim();

    if (!isValidUrl(url)) {
      return res.redirect("/liens");
    }

    if (!title) {
      title = (await fetchPageTitle(url)) || url;
    }

    insertLink({ url, title, description, type, tags });
    res.redirect("/liens");
  });

  router.post("/:id/delete", (req, res) => {
    const id = Number(req.params.id);
    if (Number.isInteger(id)) deleteLink(id);
    res.redirect("/liens");
  });

  return router;
}

module.exports = buildLinksRouter;
