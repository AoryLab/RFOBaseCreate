declare @count int
set @count = 0

while (@count < 500)
begin
	insert into tbl_PostRegistry(dck,sendserial,k,d,u,gold) values (1,0,0xFFFFFFFF,0,0x0FFFFFFF,0)

	set @count = @count + 1
end
