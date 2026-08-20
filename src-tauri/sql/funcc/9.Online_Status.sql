ALTER TABLE [dbo].[tbl_general] ADD [OnlineStatus] datetime CONSTRAINT [DF_tbl_base_OnlineStatus] DEFAULT 0 NOT NULL
GO
CREATE TRIGGER [dbo].[Online—heck] ON [dbo].[tbl_general] FOR INSERT, UPDATE AS BEGIN SET NOCOUNT ON;
IF UPDATE(TotalPlayMin) UPDATE tbl_general SET tbl_general.OnlineStatus = GETDATE()
FROM tbl_general INNER JOIN inserted ON tbl_general.Serial = inserted.Serial
END
GO