/*******************************************************/
/****** !!!! Execute each part one at a time!!!!! ******/
/*******************************************************/

/****** Add currency column to RF_World tbl_utsellinfo table ******/
USE [RF_World]
GO

ALTER TABLE tbl_utsellinfo
ADD currency TINYINT DEFAULT 1 NOT NULL;

/****** RF_World pSelect_utsellinfo_odin stored procedure ******/

USE [RF_World]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

create procedure [dbo].[pSelect_utsellinfo_odin]
@type tinyint,
@serial int,
@race tinyint
as
select s.[price], s.[owner], b.[Race], b.[Dalant], g.[GuildSerial], b.[AccountSerial], b.[Account], b.[Name], s.[currency]
 from [dbo].[tbl_utsellinfo] as s join [dbo].[tbl_base] as b
on s.[type]=@type and s.[serial]=@serial and s.[race]=@race and b.[Serial]=s.[owner] and b.[dck]=0
join [dbo].[tbl_general] as g on g.[Serial]=s.[owner]

GO

/****** RF_World pSelect_utbuysingleiteminfo_odin stored procedure ******/

USE [RF_World]
GO

SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

create procedure [dbo].[pSelect_utbuysingleiteminfo_odin]
@type tinyint,
@serial int
as
select si.[inveninx], si.[k], si.[d], si.[u], s.[price], s.[owner], si.[s], si.[t], s.[currency]
from [dbo].[tbl_utsellinfo] as s join [dbo].[tbl_utsingleiteminfo] as si
on s.[type]=@type and s.[serial]=@serial and s.[serial]=si.[serial]

GO

/****** If you have items on auction already, you need set all currency to 1 (dalant). ******/
/****** Module currency: 1 - dalant, 2 - gold point, 3 - cash point. 0 is used for search as ANY currency, can't be used for item currency prices ******/
/****** IF YOU DIDN'T EXECUTE FIRST QUERY, THIS ONE WILL MAKE ERROR AND WON'T CREATE currency COLUMN *****/
USE [RF_World]
GO

UPDATE tbl_utsellinfo SET currency = 1