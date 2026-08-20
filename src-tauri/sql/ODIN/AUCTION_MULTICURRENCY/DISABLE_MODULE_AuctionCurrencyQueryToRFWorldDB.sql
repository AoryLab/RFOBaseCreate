-- Drop the default constraint
USE [RF_World]
GO

ALTER TABLE tbl_utsellinfo
DROP CONSTRAINT DF_tbl_utsellinfo_currency

-- Now you can drop the column
USE [RF_World]
GO

ALTER TABLE tbl_utsellinfo
DROP COLUMN currency