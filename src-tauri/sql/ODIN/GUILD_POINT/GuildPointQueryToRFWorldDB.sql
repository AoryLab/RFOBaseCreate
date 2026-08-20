USE [RF_World]
GO

ALTER TABLE tbl_Guild
ADD GuildPoint int NOT NULL
DEFAULT (0)