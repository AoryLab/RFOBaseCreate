declare @count int
set @count = 0

while (@count < 10000)
begin
	insert into tbl_PostStorage( postinx, owner, poststate, k, d, u, gold, err ) values ( 0xff, 0, 0, 0xffffffff, 0, 0x0fffffff, 0, 0 )

	set @count = @count + 1
end
